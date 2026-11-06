import 'server-only';
import { and, eq, gt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '@/server/db/client';
import { sessions, users } from '@/server/db/schema';
import type { AnyPgDatabase } from '@/server/db/tenant';
import { generateSecureToken, sha256Hex } from './crypto';

export const SESSION_COOKIE_NAME = 'legaas_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  expiresAt: Date;
}

/**
 * Cria uma sessão persistida em `sessions` armazenando o hash SHA-256 do token
 * e retornando o `rawToken` para ser enviado em cookie `httpOnly`.
 */
export async function createDatabaseSession(
  params: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ rawToken: string; expiresAt: Date; sessionId: string }> {
  const rawToken = generateSecureToken(32);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const [created] = await database
    .insert(sessions)
    .values({
      userId: params.userId,
      token: tokenHash,
      expiresAt,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    })
    .returning({ id: sessions.id });

  return {
    rawToken,
    expiresAt,
    sessionId: created!.id,
  };
}

/**
 * Valida um token de sessão bruto consultando o banco (`sessions` + `users`),
 * verificando expiração e se o usuário permanece `active`.
 */
export async function getValidatedSessionByToken(
  rawToken: string | undefined | null,
  database: AnyPgDatabase = getDb(),
): Promise<AuthenticatedSession | null> {
  if (!rawToken || rawToken.trim().length < 16) {
    return null;
  }

  const tokenHash = sha256Hex(rawToken);
  const now = new Date();

  const rows = await database
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      isPlatformAdmin: users.isPlatformAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row || row.status !== 'active') {
    return null;
  }

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    email: row.email,
    name: row.name,
    isPlatformAdmin: row.isPlatformAdmin,
    expiresAt: row.expiresAt,
  };
}

/**
 * Revoga uma sessão específica no banco de dados (logout).
 */
export async function revokeSessionByToken(
  rawToken: string | undefined | null,
  database: AnyPgDatabase = getDb(),
): Promise<void> {
  if (!rawToken) {
    return;
  }
  const tokenHash = sha256Hex(rawToken);
  await database.delete(sessions).where(eq(sessions.token, tokenHash));
}

/**
 * Revoga todas as sessões ativas de um usuário (ex.: ao redefinir senha ou desativar conta).
 */
export async function revokeAllUserSessions(
  userId: string,
  database: AnyPgDatabase = getDb(),
): Promise<void> {
  await database.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Define o cookie de sessão seguro (`httpOnly`, `SameSite=Lax`, `Secure` em produção).
 */
export async function setSessionCookie(rawToken: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * Remove o cookie de sessão e revoga o registro correspondente no banco.
 */
export async function clearSessionAndCookie(database: AnyPgDatabase = getDb()): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    await revokeSessionByToken(rawToken, database);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Obtém a sessão autenticada a partir dos cookies da requisição atual no Next.js.
 */
export async function getCurrentSessionFromCookies(
  database: AnyPgDatabase = getDb(),
): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return getValidatedSessionByToken(rawToken, database);
}

import 'server-only';
import { and, eq, gt } from 'drizzle-orm';
import {
  listUserActiveOrganizations,
  type UserOrganizationSummary,
} from '@/server/context/tenant-context';
import { getDb } from '@/server/db/client';
import { accounts, users, verifications } from '@/server/db/schema';
import type { AnyPgDatabase } from '@/server/db/tenant';
import { UnauthorizedError, ValidationError } from '@/server/errors/app-error';
import { generateSecureToken, hashPassword, sha256Hex, verifyPassword } from './crypto';
import { createDatabaseSession, revokeAllUserSessions } from './session';

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1 hora
const PASSWORD_RESET_PREFIX = 'password-reset:';

export interface LoginResult {
  userId: string;
  email: string;
  name: string;
  rawSessionToken: string;
  sessionExpiresAt: Date;
  organizations: UserOrganizationSummary[];
}

/**
 * Autentica um usuário por e-mail e senha:
 * - Valida credenciais em tempo constante (`scrypt` + `timingSafeEqual`).
 * - Cria sessão persistida no banco (`sessions`) e retorna as organizações ativas do usuário.
 */
export async function authenticateWithEmailPassword(
  params: {
    email: string;
    password: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<LoginResult> {
  const normalizedEmail = params.email.trim().toLowerCase();

  const rows = await database
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      passwordHash: accounts.password,
    })
    .from(users)
    .innerJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.providerId, 'credential')))
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  const accountRow = rows[0];
  if (!accountRow || accountRow.status !== 'active' || !accountRow.passwordHash) {
    throw new UnauthorizedError('E-mail ou senha inválidos.');
  }

  const isValid = await verifyPassword({
    password: params.password,
    hash: accountRow.passwordHash,
  });

  if (!isValid) {
    throw new UnauthorizedError('E-mail ou senha inválidos.');
  }

  const session = await createDatabaseSession(
    {
      userId: accountRow.userId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
    database,
  );

  const userOrgs = await listUserActiveOrganizations(accountRow.userId, database);

  return {
    userId: accountRow.userId,
    email: accountRow.email,
    name: accountRow.name,
    rawSessionToken: session.rawToken,
    sessionExpiresAt: session.expiresAt,
    organizations: userOrgs,
  };
}

/**
 * Solicita recuperação de senha:
 * - Caso o e-mail pertença a um usuário ativo, emite um token CSPRNG de uso único
 *   (validade de 1 hora) e persiste apenas seu hash SHA-256 em `verifications`.
 * - Não revela para o chamador externo se o e-mail existe ou não.
 */
export async function requestPasswordReset(
  params: { email: string },
  database: AnyPgDatabase = getDb(),
): Promise<{ issued: boolean; rawResetToken?: string; expiresAt?: Date }> {
  const normalizedEmail = params.email.trim().toLowerCase();

  const [user] = await database
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user || user.status !== 'active') {
    return { issued: false };
  }

  const identifier = `${PASSWORD_RESET_PREFIX}${user.id}`;
  await database.delete(verifications).where(eq(verifications.identifier, identifier));

  const rawResetToken = generateSecureToken(32);
  const tokenHash = sha256Hex(rawResetToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await database.insert(verifications).values({
    identifier,
    value: tokenHash,
    expiresAt,
  });

  return {
    issued: true,
    rawResetToken,
    expiresAt,
  };
}

/**
 * Redefine a senha utilizando um token de uso único:
 * - Valida o hash SHA-256 do token e sua expiração.
 * - Atualiza o hash da senha na tabela `accounts`.
 * - Consome (remove) o token em `verifications`.
 * - Revoga todas as sessões ativas do usuário (`sessions`).
 */
export async function resetPasswordWithToken(
  params: { rawToken: string; newPassword: string },
  database: AnyPgDatabase = getDb(),
): Promise<{ userId: string }> {
  if (!params.rawToken || params.rawToken.trim().length < 16) {
    throw new ValidationError('Token de recuperação inválido ou expirado.');
  }

  const tokenHash = sha256Hex(params.rawToken.trim());
  const now = new Date();

  const [verification] = await database
    .select()
    .from(verifications)
    .where(and(eq(verifications.value, tokenHash), gt(verifications.expiresAt, now)))
    .limit(1);

  if (!verification || !verification.identifier.startsWith(PASSWORD_RESET_PREFIX)) {
    throw new ValidationError('Token de recuperação inválido ou expirado.');
  }

  const userId = verification.identifier.slice(PASSWORD_RESET_PREFIX.length);
  const passwordHash = await hashPassword(params.newPassword);

  await database.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')));

    await tx.delete(verifications).where(eq(verifications.id, verification.id));
  });

  await revokeAllUserSessions(userId, database);

  return { userId };
}

import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getServerEnv } from '@/env';
import { getDb } from '@/server/db/client';
import * as schema from '@/server/db/schema';
import { hashPassword, verifyPassword } from './crypto';

function createAuthInstance() {
  const env = getServerEnv();
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: {
        hash: (password) => hashPassword(password),
        verify: ({ password, hash }) => verifyPassword({ password, hash }),
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 dias
      updateAge: 60 * 60 * 24, // 1 dia
    },
  });
}

let authInstance: ReturnType<typeof createAuthInstance> | null = null;

/**
 * Instância Better Auth conectada ao Drizzle ORM e às tabelas `users`, `sessions`,
 * `accounts` e `verifications`.
 * - `disableSignUp: true` impõe o regime fechado aprovado na Decisão A4 (usuários
 *   ingressam exclusivamente por convite auditado de uso único).
 */
export function getAuth(): ReturnType<typeof createAuthInstance> {
  if (!authInstance) {
    authInstance = createAuthInstance();
  }
  return authInstance;
}

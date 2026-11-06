import { z } from 'zod';

/**
 * Schema das variáveis públicas expostas ao cliente (prefixo obrigatório NEXT_PUBLIC_).
 * Jamais adicione segredos, credenciais de banco ou chaves privadas neste schema.
 */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

/**
 * Schema das variáveis exclusivas do servidor.
 * Valida que DATABASE_URL (role da aplicação sem BYPASSRLS) e segredos de sessão
 * atendem aos requisitos mínimos de segurança antes da aplicação iniciar.
 */
export const serverEnvSchema = clientEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL é obrigatória (conexão da role legaas_app com RLS ativo).')
    .refine(
      (val) => val.startsWith('postgres://') || val.startsWith('postgresql://'),
      'DATABASE_URL deve iniciar com postgres:// ou postgresql://',
    ),
  DATABASE_OWNER_URL: z
    .string()
    .refine(
      (val) => val.startsWith('postgres://') || val.startsWith('postgresql://'),
      'DATABASE_OWNER_URL deve iniciar com postgres:// ou postgresql://',
    )
    .optional(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET deve possuir no mínimo 32 caracteres.'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default('sa-east-1'),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET é obrigatório.'),
  S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID é obrigatório.'),
  S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY é obrigatório.'),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().email().default('no-reply@legaas.local'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseClientEnv(raw: Record<string, string | undefined>): ClientEnv {
  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: raw.NEXT_PUBLIC_APP_URL,
  });

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente público inválida:\n${formatted}`);
  }

  return result.data;
}

export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('VIOLAÇÃO DE SEGURANÇA: parseServerEnv() não pode ser executado no navegador.');
  }

  const result = serverEnvSchema.safeParse(raw);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente do servidor inválida:\n${formatted}`);
  }

  if (
    result.data.NODE_ENV === 'production' &&
    result.data.BETTER_AUTH_SECRET.includes('dev-only-secret')
  ) {
    throw new Error(
      'VIOLAÇÃO DE SEGURANÇA: BETTER_AUTH_SECRET de desenvolvimento não é permitido em produção.',
    );
  }

  return result.data;
}

let cachedServerEnv: ServerEnv | null = null;

/**
 * Retorna as variáveis de ambiente do servidor validadas (lazy singleton).
 * Falha imediatamente se qualquer variável obrigatória estiver ausente ou inválida.
 */
export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = parseServerEnv(process.env);
  }
  return cachedServerEnv;
}

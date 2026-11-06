import { describe, expect, it } from 'vitest';
import { parseClientEnv, parseServerEnv } from '@/env';

const validEnv = {
  NODE_ENV: 'development',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://legaas_app:secret@localhost:5432/legaas_dev',
  BETTER_AUTH_SECRET: 'a-very-strong-secret-with-at-least-32-chars',
  BETTER_AUTH_URL: 'http://localhost:3000',
  S3_REGION: 'sa-east-1',
  S3_BUCKET: 'legaas-documents',
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin',
};

describe('Validação de variáveis de ambiente (src/env.ts)', () => {
  it('valida corretamente um conjunto completo de variáveis do servidor', () => {
    const parsed = parseServerEnv(validEnv);
    expect(parsed.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(parsed.S3_REGION).toBe('sa-east-1');
    expect(parsed.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('rejeita configuração quando DATABASE_URL está ausente ou inválida', () => {
    expect(() =>
      parseServerEnv({
        ...validEnv,
        DATABASE_URL: 'mysql://localhost:3306/wrong',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejeita BETTER_AUTH_SECRET com menos de 32 caracteres', () => {
    expect(() =>
      parseServerEnv({
        ...validEnv,
        BETTER_AUTH_SECRET: 'curto',
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('bloqueia o uso do segredo de desenvolvimento em produção', () => {
    expect(() =>
      parseServerEnv({
        ...validEnv,
        NODE_ENV: 'production',
        BETTER_AUTH_SECRET: 'dev-only-secret-replace-in-production-32chars',
      }),
    ).toThrow(/VIOLAÇÃO DE SEGURANÇA/);
  });

  it('expõe apenas variáveis públicas em parseClientEnv', () => {
    const clientEnv = parseClientEnv(validEnv);
    expect(clientEnv).toEqual({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    });
    expect('DATABASE_URL' in clientEnv).toBe(false);
  });
});

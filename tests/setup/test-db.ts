import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePgJs } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import postgres from 'postgres';
import * as schema from '@/server/db/schema';
import type { AnyPgDatabase } from '@/server/db/tenant';

export interface TestDatabaseHandle {
  db: AnyPgDatabase;
  execRaw: (sqlText: string) => Promise<void>;
  close: () => Promise<void>;
  engine: 'postgres-tcp' | 'pglite-wasm';
}

function loadMigrationStatements(): string[] {
  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const statements: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(drizzleDir, file), 'utf8');
    const parts = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    statements.push(...parts);
  }
  return statements;
}

async function canConnectTcpPostgres(url: string): Promise<boolean> {
  const sqlClient = postgres(url, { connect_timeout: 2, max: 1 });
  try {
    await sqlClient`SELECT 1`;
    await sqlClient.end();
    return true;
  } catch {
    await sqlClient.end().catch(() => undefined);
    return false;
  }
}

/**
 * Inicializa um banco PostgreSQL real para os testes de integração e RLS:
 * - Se houver uma instância PostgreSQL TCP acessível em `DATABASE_OWNER_URL` (ex.: CI ou Docker),
 *   utiliza-a diretamente.
 * - Caso contrário, inicializa uma instância PostgreSQL em memória via PGlite (motor Postgres real
 *   compilado para WASM, com suporte integral a Roles, RLS, FORCE RLS e FKs compostas) e aplica
 *   todas as migrations de `drizzle/*.sql`.
 */
export async function createTestDatabase(): Promise<TestDatabaseHandle> {
  const statements = loadMigrationStatements();
  const ownerUrl = process.env.DATABASE_OWNER_URL;

  if (ownerUrl && (await canConnectTcpPostgres(ownerUrl))) {
    const ownerClient = postgres(ownerUrl, { max: 4 });
    await ownerClient.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    for (const stmt of statements) {
      await ownerClient.unsafe(stmt);
    }

    const db = drizzlePgJs(ownerClient, { schema }) as unknown as AnyPgDatabase;
    return {
      db,
      execRaw: async (sqlText: string) => {
        await ownerClient.unsafe(sqlText);
      },
      close: async () => {
        await ownerClient.end();
      },
      engine: 'postgres-tcp',
    };
  }

  const pglite = new PGlite();
  for (const stmt of statements) {
    await pglite.exec(stmt);
  }

  const db = drizzlePglite(pglite, { schema }) as unknown as AnyPgDatabase;
  return {
    db,
    execRaw: async (sqlText: string) => {
      await pglite.exec(sqlText);
    },
    close: async () => {
      await pglite.close();
    },
    engine: 'pglite-wasm',
  };
}

import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getServerEnv } from '@/env';
import * as schema from './schema';
import type { AnyPgDatabase } from './tenant';

const globalForDb = globalThis as unknown as {
  sqlClient?: postgres.Sql;
  pgJsDb?: AnyPgDatabase;
};

/**
 * Retorna a instância Drizzle conectada ao PostgreSQL oficial via `DATABASE_URL` (`postgres-js`).
 * Utilizado tanto em desenvolvimento quanto em produção.
 */
export function getDb(): AnyPgDatabase {
  if (!globalForDb.pgJsDb || !globalForDb.sqlClient) {
    const env = getServerEnv();
    const client = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === 'production' ? 20 : 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    globalForDb.sqlClient = client;
    globalForDb.pgJsDb = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  }

  return globalForDb.pgJsDb;
}

/**
 * Cria uma conexão dedicada ao PostgreSQL oficial via `DATABASE_URL` (ou `DATABASE_OWNER_URL`)
 * para scripts de CLI (`pnpm org:provision`, `pnpm db:seed`, migrations).
 */
export async function resolveRuntimeOrEmbeddedDb(
  preferOwnerUrl = false,
): Promise<{ db: AnyPgDatabase; sqlClient: postgres.Sql; close: () => Promise<void> }> {
  const env = getServerEnv();
  const targetUrl =
    preferOwnerUrl && env.DATABASE_OWNER_URL ? env.DATABASE_OWNER_URL : env.DATABASE_URL;

  const sqlClient = postgres(targetUrl, {
    max: 2,
    connect_timeout: 10,
    prepare: false,
  });
  const db = drizzle(sqlClient, { schema }) as unknown as AnyPgDatabase;

  return {
    db,
    sqlClient,
    close: async () => {
      await sqlClient.end();
    },
  };
}

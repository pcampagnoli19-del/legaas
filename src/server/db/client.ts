import 'server-only';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getServerEnv } from '@/env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  sqlClient?: postgres.Sql;
  db?: Database;
};

/**
 * Retorna a instância Drizzle conectada como `legaas_app` (role sem BYPASSRLS).
 * A conexão é inicializada sob demanda (lazy) para não abrir sockets durante `next build`.
 */
export function getDb(): Database {
  if (!globalForDb.db) {
    const env = getServerEnv();
    const client = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === 'production' ? 20 : 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    globalForDb.sqlClient = client;
    globalForDb.db = drizzle(client, { schema });
  }

  return globalForDb.db;
}

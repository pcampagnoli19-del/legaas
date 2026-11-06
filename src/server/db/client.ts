import 'server-only';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePgJs } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getServerEnv } from '@/env';
import * as schema from './schema';
import type { AnyPgDatabase } from './tenant';

const globalForDb = globalThis as unknown as {
  sqlClient?: postgres.Sql;
  pgliteClient?: PGlite;
  db?: AnyPgDatabase;
  dbInitPromise?: Promise<AnyPgDatabase>;
};

function parseHostPort(connectionString: string): { host: string; port: number } {
  try {
    const url = new URL(connectionString);
    return {
      host: url.hostname || 'localhost',
      port: Number(url.port || 5432),
    };
  } catch {
    return { host: 'localhost', port: 5432 };
  }
}

function checkTcpPort(host: string, port: number, timeoutMs = 600): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(ok);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function applyMigrationsToPglite(pglite: PGlite): Promise<void> {
  const checkTable = await pglite.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'organizations'
    ) AS exists`,
  );

  if (checkTable.rows[0]?.exists) {
    return;
  }

  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(drizzleDir, file), 'utf8');
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await pglite.exec(stmt);
    }
  }
}

async function initDevEmbeddedPostgres(): Promise<AnyPgDatabase> {
  if (globalForDb.db) {
    return globalForDb.db;
  }
  const dataDir = path.resolve(process.cwd(), '.docker-data', 'pglite-dev');
  fs.mkdirSync(dataDir, { recursive: true });
  const pglite = new PGlite(dataDir);
  await applyMigrationsToPglite(pglite);
  globalForDb.pgliteClient = pglite;
  globalForDb.db = drizzlePglite(pglite, { schema }) as unknown as AnyPgDatabase;
  return globalForDb.db;
}

/**
 * Retorna a instância Drizzle conectada ao PostgreSQL:
 * - Em produção ou quando o servidor PostgreSQL TCP está ativo, usa `postgres-js`.
 * - Em desenvolvimento local (caso o daemon Docker/Postgres TCP não esteja ativo),
 *   inicializa automaticamente o motor PostgreSQL 17 persistente em `.docker-data/pglite-dev`
 *   com todas as migrations e políticas RLS aplicadas.
 */
export function getDb(): AnyPgDatabase {
  if (!globalForDb.db) {
    const env = getServerEnv();
    const localPgliteDir = path.resolve(process.cwd(), '.docker-data', 'pglite-dev');

    if (
      env.NODE_ENV === 'development' &&
      !process.env.FORCE_TCP_POSTGRES &&
      fs.existsSync(localPgliteDir)
    ) {
      const pglite = new PGlite(localPgliteDir);
      globalForDb.pgliteClient = pglite;
      globalForDb.db = drizzlePglite(pglite, { schema }) as unknown as AnyPgDatabase;
      return globalForDb.db;
    }

    const client = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === 'production' ? 20 : 5,
      idle_timeout: 20,
      connect_timeout: 5,
      prepare: false,
    });
    globalForDb.sqlClient = client;
    globalForDb.db = drizzlePgJs(client, { schema }) as unknown as AnyPgDatabase;
  }

  return globalForDb.db;
}

/**
 * Resolve a conexão de banco de dados verificando disponibilidade TCP em desenvolvimento
 * (usado pela CLI `pnpm org:provision` e fluxos administrativos locais).
 */
export async function resolveRuntimeOrEmbeddedDb(
  preferOwnerUrl = false,
): Promise<{ db: AnyPgDatabase; close: () => Promise<void> }> {
  const env = getServerEnv();
  const targetUrl =
    preferOwnerUrl && env.DATABASE_OWNER_URL ? env.DATABASE_OWNER_URL : env.DATABASE_URL;

  const { host, port } = parseHostPort(targetUrl);
  const tcpOnline = await checkTcpPort(host, port);

  if (tcpOnline || env.NODE_ENV === 'production') {
    const sqlClient = postgres(targetUrl, { max: 2, connect_timeout: 5 });
    const db = drizzlePgJs(sqlClient, { schema }) as unknown as AnyPgDatabase;
    return {
      db,
      close: async () => {
        await sqlClient.end();
      },
    };
  }

  const db = await initDevEmbeddedPostgres();
  return {
    db,
    close: async () => {
      if (globalForDb.pgliteClient) {
        await globalForDb.pgliteClient.close();
        globalForDb.pgliteClient = undefined;
        globalForDb.db = undefined;
      }
    },
  };
}

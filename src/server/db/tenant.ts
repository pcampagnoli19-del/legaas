import 'server-only';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { getDb } from './client';
import type * as schema from './schema';

const uuidSchema = z.string().uuid('organizationId inválido para contexto multi-tenant.');

export type AnyPgDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface TenantExecutionContext {
  organizationId: string;
  actorMembershipId?: string | null;
}

/**
 * Executa uma operação de banco de dados dentro de uma transação isolada por tenant:
 * 1. Valida que `organizationId` é um UUID válido.
 * 2. Assume explicitamente a role `legaas_app` (`SET LOCAL ROLE legaas_app`) na transação,
 *    garantindo que o Row-Level Security seja imposto mesmo em ambientes de teste onde a
 *    conexão base tenha sido aberta por um usuário owner.
 * 3. Define `SET LOCAL app.current_org_id = '<organizationId>'`, escopado estritamente
 *    à transação atual (compatível com PgBouncer em transaction mode).
 */
export async function withTenant<T>(
  ctx: TenantExecutionContext,
  callback: (tx: AnyPgDatabase) => Promise<T>,
  database: AnyPgDatabase = getDb(),
): Promise<T> {
  const organizationId = uuidSchema.parse(ctx.organizationId);

  return database.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE legaas_app`);
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${organizationId}, true)`);

    if (ctx.actorMembershipId) {
      const actorId = uuidSchema.parse(ctx.actorMembershipId);
      await tx.execute(sql`SELECT set_config('app.current_actor_id', ${actorId}, true)`);
    }

    return callback(tx);
  });
}

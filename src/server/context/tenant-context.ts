import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { departmentMembers } from '@/server/db/schema';
import { type AnyPgDatabase, withTenant } from '@/server/db/tenant';
import { NotFoundError } from '@/server/errors/app-error';

export type MembershipRole =
  'org_admin' | 'manager' | 'coordinator' | 'analyst' | 'viewer' | 'external';

export type MembershipKind = 'internal' | 'external';

export interface OfficeTenantContext {
  userId: string;
  organizationId: string;
  orgName: string;
  orgSlug: string;
  orgTimezone: string;
  membershipId: string;
  role: Exclude<MembershipRole, 'external'>;
  kind: 'internal';
  departmentIds: string[];
}

export interface UserOrganizationSummary {
  organizationId: string;
  orgName: string;
  orgSlug: string;
  membershipId: string;
  kind: MembershipKind;
  role: MembershipRole;
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  const maybeObj = result as { rows?: T[] } | null | undefined;
  return maybeObj?.rows ?? [];
}

/**
 * Resolve e valida o contexto da organização ativa (`/[orgSlug]`) para o ambiente Legaas Office:
 * - Executa sob a role `legaas_app`.
 * - Caso a organização não exista, esteja suspensa, o usuário não pertença a ela ou seja
 *   um usuário `external`, lança `NotFoundError` (404) para jamais vazar a existência da organização.
 */
export async function resolveOfficeTenantContext(
  params: { userId: string; orgSlug: string },
  database: AnyPgDatabase = getDb(),
): Promise<OfficeTenantContext> {
  const resolved = await database.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE legaas_app`);
    const raw = await tx.execute(
      sql`SELECT * FROM public.resolve_user_org_membership(${params.userId}::uuid, ${params.orgSlug}::text)`,
    );
    const rows = extractRows<{
      organization_id: string;
      org_name: string;
      org_slug: string;
      org_timezone: string;
      membership_id: string;
      membership_kind: MembershipKind;
      membership_role: MembershipRole;
    }>(raw);

    return rows[0] ?? null;
  });

  if (
    !resolved ||
    resolved.membership_kind !== 'internal' ||
    resolved.membership_role === 'external'
  ) {
    throw new NotFoundError('Organização não encontrada ou acesso indisponível.');
  }

  const departmentIds = await withTenant(
    {
      organizationId: resolved.organization_id,
      actorMembershipId: resolved.membership_id,
    },
    async (tx) => {
      const membershipsInDepts = await tx
        .select({ departmentId: departmentMembers.departmentId })
        .from(departmentMembers)
        .where(eq(departmentMembers.membershipId, resolved.membership_id));

      return membershipsInDepts.map((d) => d.departmentId);
    },
    database,
  );

  return {
    userId: params.userId,
    organizationId: resolved.organization_id,
    orgName: resolved.org_name,
    orgSlug: resolved.org_slug,
    orgTimezone: resolved.org_timezone,
    membershipId: resolved.membership_id,
    role: resolved.membership_role,
    kind: 'internal',
    departmentIds,
  };
}

/**
 * Lista todas as organizações ativas às quais o usuário autenticado pertence.
 */
export async function listUserActiveOrganizations(
  userId: string,
  database: AnyPgDatabase = getDb(),
): Promise<UserOrganizationSummary[]> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE legaas_app`);
    const raw = await tx.execute(
      sql`SELECT * FROM public.list_user_organizations(${userId}::uuid)`,
    );
    const rows = extractRows<{
      organization_id: string;
      org_name: string;
      org_slug: string;
      membership_id: string;
      membership_kind: MembershipKind;
      membership_role: MembershipRole;
    }>(raw);

    return rows.map((row) => ({
      organizationId: row.organization_id,
      orgName: row.org_name,
      orgSlug: row.org_slug,
      membershipId: row.membership_id,
      kind: row.membership_kind,
      role: row.membership_role,
    }));
  });
}

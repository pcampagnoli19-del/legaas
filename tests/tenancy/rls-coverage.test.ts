import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activityLog,
  clients,
  companies,
  demands,
  departments,
  memberships,
  organizations,
  serviceCategories,
  serviceTypes,
  users,
  workflows,
  workflowStages,
} from '@/server/db/schema';
import { withTenant } from '@/server/db/tenant';
import { createTestDatabase, type TestDatabaseHandle } from '../setup/test-db';

describe('Isolamento Multi-Tenant, Meta-Teste de RLS e Integridade Relacional', () => {
  let handle: TestDatabaseHandle;

  const orgAId = '01950000-0000-7000-8000-000000000001';
  const orgBId = '01950000-0000-7000-8000-000000000002';
  const userAId = '01950000-0000-7000-8000-000000000011';
  const userBId = '01950000-0000-7000-8000-000000000012';
  const membershipAId = '01950000-0000-7000-8000-000000000021';
  const membershipBId = '01950000-0000-7000-8000-000000000022';

  beforeAll(async () => {
    handle = await createTestDatabase();

    // Seed base (executado pelo owner da conexão antes de assumir legaas_app)
    await handle.db.insert(organizations).values([
      { id: orgAId, name: 'Vértice Paralegal Ltda', slug: 'vertice-paralegal' },
      { id: orgBId, name: 'Atlas Societário S.A.', slug: 'atlas-societario' },
    ]);

    await handle.db.insert(users).values([
      { id: userAId, name: 'Ana Operações', email: 'ana@vertice.leg.br', emailVerified: true },
      { id: userBId, name: 'Bruno Gestão', email: 'bruno@atlas.leg.br', emailVerified: true },
    ]);

    await handle.db.insert(memberships).values([
      {
        id: membershipAId,
        organizationId: orgAId,
        userId: userAId,
        kind: 'internal',
        role: 'org_admin',
        status: 'active',
      },
      {
        id: membershipBId,
        organizationId: orgBId,
        userId: userBId,
        kind: 'internal',
        role: 'org_admin',
        status: 'active',
      },
    ]);
  });

  afterAll(async () => {
    await handle.close();
  });

  it('META-TESTE: toda tabela com coluna organization_id possui ENABLE + FORCE RLS e política ativa', async () => {
    const result = await handle.db.execute(sql`
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced,
        COUNT(p.polname)::int AS policy_count
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attname = 'organization_id'
        AND NOT a.attisdropped
      GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
      ORDER BY c.relname;
    `);

    const rows = result as unknown as {
      rows?: Array<{
        table_name: string;
        rls_enabled: boolean;
        rls_forced: boolean;
        policy_count: number;
      }>;
    };
    const list = Array.isArray(result) ? result : (rows.rows ?? []);

    expect(list.length).toBeGreaterThanOrEqual(22);

    const unprotected = list.filter(
      (t) => !t.rls_enabled || !t.rls_forced || Number(t.policy_count) < 1,
    );

    expect(unprotected).toEqual([]);
  });

  it('META-TESTE: a role legaas_app não possui SUPERUSER nem BYPASSRLS', async () => {
    const result = await handle.db.execute(sql`
      SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
      FROM pg_roles
      WHERE rolname = 'legaas_app';
    `);

    const rows = Array.isArray(result)
      ? result
      : ((result as unknown as { rows: unknown[] }).rows ?? []);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rolname: 'legaas_app',
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
  });

  it('sem app.current_org_id definido, a role legaas_app enxerga 0 linhas e não consegue inserir', async () => {
    const visibleOrgs = await handle.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE legaas_app`);
      return tx.select().from(organizations);
    });

    expect(visibleOrgs).toHaveLength(0);

    await expect(
      handle.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE legaas_app`);
        await tx.insert(clients).values({
          organizationId: orgAId,
          name: 'Cliente Sem Contexto',
        });
      }),
    ).rejects.toThrow();
  });

  it('isola rigorosamente leituras e escritas entre Org A e Org B via withTenant()', async () => {
    const clientA = await withTenant(
      { organizationId: orgAId, actorMembershipId: membershipAId },
      async (tx) => {
        const [created] = await tx
          .insert(clients)
          .values({
            organizationId: orgAId,
            name: 'Grupo Horizonte S.A.',
            taxId: '12345678000190',
          })
          .returning();
        return created;
      },
      handle.db,
    );

    const clientB = await withTenant(
      { organizationId: orgBId, actorMembershipId: membershipBId },
      async (tx) => {
        const [created] = await tx
          .insert(clients)
          .values({
            organizationId: orgBId,
            name: 'Holding Atlântica Ltda',
            taxId: '98765432000110',
          })
          .returning();
        return created;
      },
      handle.db,
    );

    expect(clientA?.organizationId).toBe(orgAId);
    expect(clientB?.organizationId).toBe(orgBId);

    // Org A jamais vê dados de Org B
    const clientsSeenByA = await withTenant(
      { organizationId: orgAId },
      async (tx) => tx.select().from(clients),
      handle.db,
    );
    expect(clientsSeenByA).toHaveLength(1);
    expect(clientsSeenByA[0]?.name).toBe('Grupo Horizonte S.A.');

    // Org A jamais consegue inserir registro forjando organizationId de Org B
    await expect(
      withTenant(
        { organizationId: orgAId },
        async (tx) => {
          await tx.insert(clients).values({
            organizationId: orgBId,
            name: 'Injeção Cross-Tenant',
          });
        },
        handle.db,
      ),
    ).rejects.toThrow();
  });

  it('garante integridade via FK tripla (Decisão A2): impede vincular demanda a empresa de outro cliente da mesma organização', async () => {
    const setupData = await withTenant(
      { organizationId: orgAId, actorMembershipId: membershipAId },
      async (tx) => {
        const [client1] = await tx
          .insert(clients)
          .values({ organizationId: orgAId, name: 'Cliente Alfa' })
          .returning();

        const [client2] = await tx
          .insert(clients)
          .values({ organizationId: orgAId, name: 'Cliente Beta' })
          .returning();

        const [companyOfClient2] = await tx
          .insert(companies)
          .values({
            organizationId: orgAId,
            clientId: client2!.id,
            cnpj: '11222333000181',
            legalName: 'Beta Empreendimentos SPE Ltda',
          })
          .returning();

        const [dept] = await tx
          .insert(departments)
          .values({ organizationId: orgAId, name: 'Societário' })
          .returning();

        const [cat] = await tx
          .insert(serviceCategories)
          .values({ organizationId: orgAId, name: 'Atos Societários' })
          .returning();

        const [wf] = await tx
          .insert(workflows)
          .values({ organizationId: orgAId, name: 'Fluxo Societário Padrão', isDefault: true })
          .returning();

        const [stage] = await tx
          .insert(workflowStages)
          .values({
            organizationId: orgAId,
            workflowId: wf!.id,
            name: 'Triagem',
            category: 'backlog',
            position: 1,
          })
          .returning();

        const [svc] = await tx
          .insert(serviceTypes)
          .values({
            organizationId: orgAId,
            categoryId: cat!.id,
            name: 'Alteração Contratual',
            defaultDepartmentId: dept!.id,
            defaultWorkflowId: wf!.id,
          })
          .returning();

        return {
          client1: client1!,
          client2: client2!,
          companyOfClient2: companyOfClient2!,
          dept: dept!,
          wf: wf!,
          stage: stage!,
          svc: svc!,
        };
      },
      handle.db,
    );

    // Tentar criar demanda para client1 apontando para companyOfClient2 deve falhar na FK tripla!
    await expect(
      withTenant(
        { organizationId: orgAId, actorMembershipId: membershipAId },
        async (tx) => {
          await tx.insert(demands).values({
            organizationId: orgAId,
            number: 1,
            code: 'DEM-2026-000001',
            title: 'Alteração de endereço social',
            clientId: setupData.client1.id,
            companyId: setupData.companyOfClient2.id,
            serviceTypeId: setupData.svc.id,
            workflowId: setupData.wf.id,
            stageId: setupData.stage.id,
            statusCategory: 'backlog',
            departmentId: setupData.dept.id,
            createdByMembershipId: membershipAId,
          });
        },
        handle.db,
      ),
    ).rejects.toThrow();

    // Já com o client2 (dono legítimo de companyOfClient2), a inserção funciona perfeitamente:
    const validDemand = await withTenant(
      { organizationId: orgAId, actorMembershipId: membershipAId },
      async (tx) => {
        const [created] = await tx
          .insert(demands)
          .values({
            organizationId: orgAId,
            number: 1,
            code: 'DEM-2026-000001',
            title: 'Alteração de endereço social',
            clientId: setupData.client2.id,
            companyId: setupData.companyOfClient2.id,
            serviceTypeId: setupData.svc.id,
            workflowId: setupData.wf.id,
            stageId: setupData.stage.id,
            statusCategory: 'backlog',
            departmentId: setupData.dept.id,
            createdByMembershipId: membershipAId,
          })
          .returning();
        return created;
      },
      handle.db,
    );

    expect(validDemand?.code).toBe('DEM-2026-000001');
  });

  it('impõe append-only em activity_log: permite INSERT, mas bloqueia UPDATE e DELETE pela role legaas_app', async () => {
    const insertedLog = await withTenant(
      { organizationId: orgAId, actorMembershipId: membershipAId },
      async (tx) => {
        const [entry] = await tx
          .insert(activityLog)
          .values({
            organizationId: orgAId,
            actorMembershipId: membershipAId,
            action: 'client.created',
            entityType: 'client',
            entityId: '01950000-0000-7000-8000-000000000099',
            changes: { name: 'Grupo Horizonte S.A.' },
          })
          .returning();
        return entry;
      },
      handle.db,
    );

    expect(insertedLog?.action).toBe('client.created');

    await expect(
      withTenant(
        { organizationId: orgAId },
        async (tx) => {
          await tx.execute(sql`DELETE FROM activity_log WHERE id = ${insertedLog!.id}::uuid`);
        },
        handle.db,
      ),
    ).rejects.toThrow();

    await expect(
      withTenant(
        { organizationId: orgAId },
        async (tx) => {
          await tx.execute(
            sql`UPDATE activity_log SET action = 'tampered' WHERE id = ${insertedLog!.id}::uuid`,
          );
        },
        handle.db,
      ),
    ).rejects.toThrow();
  });
});

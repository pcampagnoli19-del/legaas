import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { assertPermission } from '@/server/authz/permissions';
import type { OfficeTenantContext } from '@/server/context/tenant-context';
import { getDb } from '@/server/db/client';
import {
  activityLog,
  departmentMembers,
  departments,
  memberships,
  users,
} from '@/server/db/schema';
import { type AnyPgDatabase, withTenant } from '@/server/db/tenant';
import { ConflictError, NotFoundError } from '@/server/errors/app-error';

export type DepartmentMemberRole = 'member' | 'coordinator' | 'manager';

export interface DepartmentParticipantDTO {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  departmentRole: DepartmentMemberRole;
}

export interface DepartmentDTO {
  id: string;
  name: string;
  description: string | null;
  participants: DepartmentParticipantDTO[];
  createdAt: Date;
}

/**
 * Lista todos os departamentos ativos da organização com seus respectivos membros,
 * coordenadores e gestores.
 */
export async function listOrganizationDepartments(
  ctx: OfficeTenantContext,
  database: AnyPgDatabase = getDb(),
): Promise<DepartmentDTO[]> {
  assertPermission(ctx, 'department.read');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const deptRows = await tx
        .select()
        .from(departments)
        .where(
          and(eq(departments.organizationId, ctx.organizationId), isNull(departments.archivedAt)),
        )
        .orderBy(asc(departments.name));

      const participantRows = await tx
        .select({
          departmentId: departmentMembers.departmentId,
          membershipId: memberships.id,
          userId: users.id,
          name: users.name,
          email: users.email,
          departmentRole: departmentMembers.role,
        })
        .from(departmentMembers)
        .innerJoin(
          memberships,
          and(
            eq(memberships.organizationId, departmentMembers.organizationId),
            eq(memberships.id, departmentMembers.membershipId),
          ),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(departmentMembers.organizationId, ctx.organizationId),
            eq(memberships.status, 'active'),
          ),
        )
        .orderBy(asc(users.name));

      const byDept = new Map<string, DepartmentParticipantDTO[]>();
      for (const row of participantRows) {
        const list = byDept.get(row.departmentId) ?? [];
        list.push({
          membershipId: row.membershipId,
          userId: row.userId,
          name: row.name,
          email: row.email,
          departmentRole: row.departmentRole,
        });
        byDept.set(row.departmentId, list);
      }

      return deptRows.map((dept) => ({
        id: dept.id,
        name: dept.name,
        description: dept.description,
        participants: byDept.get(dept.id) ?? [],
        createdAt: dept.createdAt,
      }));
    },
    database,
  );
}

/**
 * Cria um novo departamento na organização ativa (`org_admin`).
 */
export async function createDepartment(
  ctx: OfficeTenantContext,
  input: {
    name: string;
    description?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; name: string }> {
  assertPermission(ctx, 'department.create');

  const trimmedName = input.name.trim();

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const existing = await tx
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.organizationId, ctx.organizationId),
            eq(departments.name, trimmedName),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        throw new ConflictError(
          `Já existe um departamento chamado "${trimmedName}" nesta organização.`,
        );
      }

      const [created] = await tx
        .insert(departments)
        .values({
          organizationId: ctx.organizationId,
          name: trimmedName,
          description: input.description?.trim() || null,
        })
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'department.created',
        entityType: 'department',
        entityId: created!.id,
        changes: {
          name: created!.name,
          description: created!.description,
        },
      });

      return {
        id: created!.id,
        name: created!.name,
      };
    },
    database,
  );
}

/**
 * Atualiza nome e descrição de um departamento existente (`org_admin`).
 */
export async function updateDepartment(
  ctx: OfficeTenantContext,
  input: {
    departmentId: string;
    name: string;
    description?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; name: string }> {
  assertPermission(ctx, 'department.update');

  const trimmedName = input.name.trim();

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(departments)
        .where(
          and(
            eq(departments.organizationId, ctx.organizationId),
            eq(departments.id, input.departmentId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Departamento não encontrado nesta organização.');
      }

      const [updated] = await tx
        .update(departments)
        .set({
          name: trimmedName,
          description: input.description?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(departments.id, existing.id))
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'department.updated',
        entityType: 'department',
        entityId: existing.id,
        changes: {
          previousName: existing.name,
          newName: updated!.name,
        },
      });

      return {
        id: updated!.id,
        name: updated!.name,
      };
    },
    database,
  );
}

/**
 * Associa um membro a um departamento ou atualiza seu papel no departamento (`member`, `coordinator`, `manager`).
 */
export async function assignMemberToDepartment(
  ctx: OfficeTenantContext,
  input: {
    departmentId: string;
    membershipId: string;
    departmentRole: DepartmentMemberRole;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; departmentRole: DepartmentMemberRole }> {
  assertPermission(ctx, 'department.assign_member');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existingAssignment] = await tx
        .select()
        .from(departmentMembers)
        .where(
          and(
            eq(departmentMembers.organizationId, ctx.organizationId),
            eq(departmentMembers.departmentId, input.departmentId),
            eq(departmentMembers.membershipId, input.membershipId),
          ),
        )
        .limit(1);

      let assignmentId: string;

      if (!existingAssignment) {
        const [created] = await tx
          .insert(departmentMembers)
          .values({
            organizationId: ctx.organizationId,
            departmentId: input.departmentId,
            membershipId: input.membershipId,
            role: input.departmentRole,
          })
          .returning();
        assignmentId = created!.id;
      } else {
        const [updated] = await tx
          .update(departmentMembers)
          .set({ role: input.departmentRole })
          .where(eq(departmentMembers.id, existingAssignment.id))
          .returning();
        assignmentId = updated!.id;
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'department.member_assigned',
        entityType: 'department_member',
        entityId: assignmentId,
        changes: {
          departmentId: input.departmentId,
          membershipId: input.membershipId,
          departmentRole: input.departmentRole,
        },
      });

      return {
        id: assignmentId,
        departmentRole: input.departmentRole,
      };
    },
    database,
  );
}

/**
 * Remove a associação de um membro com determinado departamento.
 */
export async function removeMemberFromDepartment(
  ctx: OfficeTenantContext,
  input: {
    departmentId: string;
    membershipId: string;
  },
  database: AnyPgDatabase = getDb(),
): Promise<void> {
  assertPermission(ctx, 'department.assign_member');

  await withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(departmentMembers)
        .where(
          and(
            eq(departmentMembers.organizationId, ctx.organizationId),
            eq(departmentMembers.departmentId, input.departmentId),
            eq(departmentMembers.membershipId, input.membershipId),
          ),
        )
        .limit(1);

      if (!existing) {
        return;
      }

      await tx.delete(departmentMembers).where(eq(departmentMembers.id, existing.id));

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'department.member_removed',
        entityType: 'department_member',
        entityId: existing.id,
        changes: {
          departmentId: input.departmentId,
          membershipId: input.membershipId,
        },
      });
    },
    database,
  );
}

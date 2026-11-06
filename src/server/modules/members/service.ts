import 'server-only';
import { and, asc, eq, gt, isNull, ne } from 'drizzle-orm';
import { generateSecureToken, sha256Hex } from '@/server/auth/crypto';
import { revokeAllUserSessions } from '@/server/auth/session';
import { assertPermission } from '@/server/authz/permissions';
import type { MembershipRole, OfficeTenantContext } from '@/server/context/tenant-context';
import { getDb } from '@/server/db/client';
import {
  activityLog,
  departmentMembers,
  departments,
  invitations,
  memberships,
  users,
} from '@/server/db/schema';
import { type AnyPgDatabase, withTenant } from '@/server/db/tenant';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app-error';

const INVITE_EXPIRATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias
const SYSTEM_PROVISIONER_EMAIL = 'system-provisioner@legaas.internal';

export type InternalRole = Exclude<MembershipRole, 'external'>;

export interface MemberDepartmentAssignment {
  departmentId: string;
  departmentName: string;
  departmentRole: 'member' | 'coordinator' | 'manager';
}

export interface OrganizationMemberDTO {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: InternalRole;
  status: 'invited' | 'active' | 'disabled';
  departments: MemberDepartmentAssignment[];
  createdAt: Date;
}

export interface PendingInvitationDTO {
  invitationId: string;
  email: string;
  role: InternalRole;
  expiresAt: Date;
  createdAt: Date;
}

export interface OrganizationTeamDirectory {
  members: OrganizationMemberDTO[];
  pendingInvitations: PendingInvitationDTO[];
}

/**
 * Lista todos os membros internos e convites pendentes da organização ativa (`ctx.organizationId`).
 */
export async function listOrganizationMembers(
  ctx: OfficeTenantContext,
  database: AnyPgDatabase = getDb(),
): Promise<OrganizationTeamDirectory> {
  assertPermission(ctx, 'member.read');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const memberRows = await tx
        .select({
          membershipId: memberships.id,
          userId: users.id,
          name: users.name,
          email: users.email,
          role: memberships.role,
          status: memberships.status,
          createdAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.organizationId, ctx.organizationId),
            eq(memberships.kind, 'internal'),
            ne(users.email, SYSTEM_PROVISIONER_EMAIL),
          ),
        )
        .orderBy(asc(users.name));

      const deptAssignments = await tx
        .select({
          membershipId: departmentMembers.membershipId,
          departmentId: departments.id,
          departmentName: departments.name,
          departmentRole: departmentMembers.role,
        })
        .from(departmentMembers)
        .innerJoin(
          departments,
          and(
            eq(departments.organizationId, departmentMembers.organizationId),
            eq(departments.id, departmentMembers.departmentId),
          ),
        )
        .where(
          and(
            eq(departmentMembers.organizationId, ctx.organizationId),
            isNull(departments.archivedAt),
          ),
        );

      const deptsByMembership = new Map<string, MemberDepartmentAssignment[]>();
      for (const item of deptAssignments) {
        const list = deptsByMembership.get(item.membershipId) ?? [];
        list.push({
          departmentId: item.departmentId,
          departmentName: item.departmentName,
          departmentRole: item.departmentRole,
        });
        deptsByMembership.set(item.membershipId, list);
      }

      const now = new Date();
      const pendingRows = await tx
        .select({
          invitationId: invitations.id,
          email: invitations.email,
          role: invitations.role,
          expiresAt: invitations.expiresAt,
          createdAt: invitations.createdAt,
        })
        .from(invitations)
        .where(
          and(
            eq(invitations.organizationId, ctx.organizationId),
            eq(invitations.kind, 'internal'),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, now),
          ),
        )
        .orderBy(asc(invitations.email));

      return {
        members: memberRows
          .filter((r): r is typeof r & { role: InternalRole } => r.role !== 'external')
          .map((row) => ({
            membershipId: row.membershipId,
            userId: row.userId,
            name: row.name,
            email: row.email,
            role: row.role,
            status: row.status,
            departments: deptsByMembership.get(row.membershipId) ?? [],
            createdAt: row.createdAt,
          })),
        pendingInvitations: pendingRows
          .filter((r): r is typeof r & { role: InternalRole } => r.role !== 'external')
          .map((row) => ({
            invitationId: row.invitationId,
            email: row.email,
            role: row.role,
            expiresAt: row.expiresAt,
            createdAt: row.createdAt,
          })),
      };
    },
    database,
  );
}

/**
 * Emite um convite de uso único para um novo membro interno da organização.
 * Exige permissão `member.invite` (`org_admin`).
 */
export async function inviteOrganizationMember(
  ctx: OfficeTenantContext,
  input: {
    email: string;
    role: InternalRole;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{
  invitationId: string;
  email: string;
  role: InternalRole;
  rawInviteToken: string;
  expiresAt: Date;
}> {
  assertPermission(ctx, 'member.invite');

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) {
    throw new ValidationError('Informe um endereço de e-mail válido.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const existingMember = await tx
        .select({ membershipId: memberships.id, status: memberships.status })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(eq(memberships.organizationId, ctx.organizationId), eq(users.email, normalizedEmail)),
        )
        .limit(1);

      if (existingMember[0]?.status === 'active') {
        throw new ConflictError(
          `O e-mail "${normalizedEmail}" já pertence a um membro ativo desta organização.`,
        );
      }

      // Revoga convites pendentes anteriores para o mesmo e-mail na organização
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(invitations.organizationId, ctx.organizationId),
            eq(invitations.email, normalizedEmail),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        );

      const rawInviteToken = generateSecureToken(32);
      const tokenHash = sha256Hex(rawInviteToken);
      const expiresAt = new Date(Date.now() + INVITE_EXPIRATION_MS);

      const [created] = await tx
        .insert(invitations)
        .values({
          organizationId: ctx.organizationId,
          email: normalizedEmail,
          kind: 'internal',
          role: input.role,
          tokenHash,
          invitedByMembershipId: ctx.membershipId,
          expiresAt,
        })
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'invitation.created',
        entityType: 'invitation',
        entityId: created!.id,
        changes: {
          email: normalizedEmail,
          role: input.role,
        },
      });

      return {
        invitationId: created!.id,
        email: normalizedEmail,
        role: input.role,
        rawInviteToken,
        expiresAt,
      };
    },
    database,
  );
}

/**
 * Atualiza o papel de acesso (`role`) de um membro da organização.
 * Exige permissão `member.update_role` e bloqueia auto-rebaixamento do próprio administrador.
 */
export async function updateOrganizationMemberRole(
  ctx: OfficeTenantContext,
  input: {
    targetMembershipId: string;
    newRole: InternalRole;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ membershipId: string; role: InternalRole }> {
  assertPermission(ctx, 'member.update_role', {
    targetMembershipId: input.targetMembershipId,
  });

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, ctx.organizationId),
            eq(memberships.id, input.targetMembershipId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Membro não encontrado nesta organização.');
      }

      const [updated] = await tx
        .update(memberships)
        .set({
          role: input.newRole,
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, existing.id))
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'member.role_updated',
        entityType: 'membership',
        entityId: existing.id,
        changes: {
          previousRole: existing.role,
          newRole: input.newRole,
        },
      });

      return {
        membershipId: updated!.id,
        role: input.newRole,
      };
    },
    database,
  );
}

/**
 * Ativa ou desativa o vínculo (`Membership`) de um usuário na organização.
 * Quando desativado (`disabled`), revoga todas as sessões ativas do usuário para encerramento imediato.
 */
export async function setOrganizationMemberStatus(
  ctx: OfficeTenantContext,
  input: {
    targetMembershipId: string;
    status: 'active' | 'disabled';
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ membershipId: string; status: 'active' | 'disabled' }> {
  assertPermission(ctx, 'member.deactivate', {
    targetMembershipId: input.targetMembershipId,
  });

  const result = await withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, ctx.organizationId),
            eq(memberships.id, input.targetMembershipId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Membro não encontrado nesta organização.');
      }

      const [updated] = await tx
        .update(memberships)
        .set({
          status: input.status,
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, existing.id))
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: input.status === 'disabled' ? 'member.deactivated' : 'member.reactivated',
        entityType: 'membership',
        entityId: existing.id,
        changes: {
          previousStatus: existing.status,
          newStatus: input.status,
        },
      });

      return {
        membershipId: updated!.id,
        userId: existing.userId,
        status: input.status,
      };
    },
    database,
  );

  if (result.status === 'disabled') {
    await revokeAllUserSessions(result.userId, database);
  }

  return {
    membershipId: result.membershipId,
    status: result.status,
  };
}

/**
 * Revoga um convite pendente da organização.
 */
export async function revokeOrganizationInvitation(
  ctx: OfficeTenantContext,
  input: { invitationId: string },
  database: AnyPgDatabase = getDb(),
): Promise<{ invitationId: string }> {
  assertPermission(ctx, 'member.invite');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.organizationId, ctx.organizationId),
            eq(invitations.id, input.invitationId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Convite não encontrado nesta organização.');
      }

      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(eq(invitations.id, existing.id));

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'invitation.revoked',
        entityType: 'invitation',
        entityId: existing.id,
        changes: { email: existing.email },
      });

      return { invitationId: existing.id };
    },
    database,
  );
}

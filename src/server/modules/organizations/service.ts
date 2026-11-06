import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { generateSecureToken, hashPassword, sha256Hex } from '@/server/auth/crypto';
import type { MembershipKind, MembershipRole } from '@/server/context/tenant-context';
import { getDb } from '@/server/db/client';
import {
  accounts,
  activityLog,
  departments,
  invitations,
  memberships,
  organizations,
  serviceCategories,
  serviceTypes,
  users,
  workflows,
  workflowStages,
} from '@/server/db/schema';
import { type AnyPgDatabase, withTenant } from '@/server/db/tenant';
import { ConflictError, ValidationError } from '@/server/errors/app-error';

const INVITE_EXPIRATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

export interface ProvisionOrganizationInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminName?: string;
  timezone?: string;
}

export interface ProvisionOrganizationOutput {
  organizationId: string;
  slug: string;
  name: string;
  invitationId: string;
  adminEmail: string;
  rawInviteToken: string;
  inviteExpiresAt: Date;
}

export interface InspectedInvitation {
  status: 'valid' | 'expired' | 'accepted' | 'revoked' | 'not_found';
  invitationId?: string;
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
  email?: string;
  kind?: MembershipKind;
  role?: MembershipRole;
  expiresAt?: Date;
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  const maybeObj = result as { rows?: T[] } | null | undefined;
  return maybeObj?.rows ?? [];
}

/**
 * Provisiona uma nova Organização em regime fechado (Decisão A4):
 * - Cria a `Organization`.
 * - Cria um membro técnico de provisionamento inicial para assinar o convite do primeiro `org_admin`.
 * - Configura estrutura operacional padrão da organização (Departamento "Operações",
 *   Workflow padrão com 5 etapas e Categoria/Serviço inicial) dentro de `withTenant`.
 * - Emite um convite de uso único (`invitations`) para `adminEmail`, persistindo apenas o `token_hash` SHA-256.
 * - Registra `organization.provisioned` e `invitation.created` no `activity_log`.
 */
export async function provisionOrganization(
  input: ProvisionOrganizationInput,
  database: AnyPgDatabase = getDb(),
): Promise<ProvisionOrganizationOutput> {
  const normalizedSlug = input.slug.trim().toLowerCase();
  const normalizedEmail = input.adminEmail.trim().toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
    throw new ValidationError(
      'O slug da organização deve conter apenas letras minúsculas, números e hífens.',
    );
  }

  return database.transaction(async (tx) => {
    const existingOrg = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, normalizedSlug))
      .limit(1);

    if (existingOrg.length > 0) {
      throw new ConflictError(`Já existe uma organização com o slug "${normalizedSlug}".`);
    }

    const [org] = await tx
      .insert(organizations)
      .values({
        name: input.name.trim(),
        slug: normalizedSlug,
        timezone: input.timezone ?? 'America/Sao_Paulo',
        status: 'active',
      })
      .returning();

    // Garante usuário de sistema (platform provisioner) para vínculo de autoria do convite inicial
    const systemEmail = 'system-provisioner@legaas.internal';
    let [provisionerUser] = await tx
      .select()
      .from(users)
      .where(eq(users.email, systemEmail))
      .limit(1);

    if (!provisionerUser) {
      [provisionerUser] = await tx
        .insert(users)
        .values({
          name: 'Legaas Provisioner',
          email: systemEmail,
          emailVerified: true,
          status: 'active',
          isPlatformAdmin: true,
        })
        .returning();
    }

    const [provisionerMembership] = await tx
      .insert(memberships)
      .values({
        organizationId: org!.id,
        userId: provisionerUser!.id,
        kind: 'internal',
        role: 'org_admin',
        status: 'disabled', // Conta técnica inativa para login, usada apenas como FK de autoria inicial
      })
      .returning();

    const rawInviteToken = generateSecureToken(32);
    const tokenHash = sha256Hex(rawInviteToken);
    const inviteExpiresAt = new Date(Date.now() + INVITE_EXPIRATION_MS);

    // Configura as entidades padrão sob o isolamento de RLS da nova organização
    await tx.execute(sql`SET LOCAL ROLE legaas_app`);
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${org!.id}, true)`);

    const [defaultDept] = await tx
      .insert(departments)
      .values({
        organizationId: org!.id,
        name: 'Operações Societárias e Paralegais',
        description: 'Departamento operacional padrão da organização.',
      })
      .returning();

    const [defaultWorkflow] = await tx
      .insert(workflows)
      .values({
        organizationId: org!.id,
        name: 'Fluxo Operacional Padrão',
        description: 'Fluxo base configurável para execução de demandas.',
        isDefault: true,
      })
      .returning();

    await tx.insert(workflowStages).values([
      {
        organizationId: org!.id,
        workflowId: defaultWorkflow!.id,
        name: 'Triagem e Documentação',
        position: 1,
        category: 'backlog',
        clientVisible: true,
        clientLabel: 'Recebido para análise',
      },
      {
        organizationId: org!.id,
        workflowId: defaultWorkflow!.id,
        name: 'Em Execução',
        position: 2,
        category: 'active',
        clientVisible: true,
        clientLabel: 'Em andamento',
      },
      {
        organizationId: org!.id,
        workflowId: defaultWorkflow!.id,
        name: 'Aguardando Cliente / Órgão',
        position: 3,
        category: 'waiting',
        clientVisible: true,
        clientLabel: 'Pendente de retorno ou órgão externo',
      },
      {
        organizationId: org!.id,
        workflowId: defaultWorkflow!.id,
        name: 'Concluída',
        position: 4,
        category: 'done',
        clientVisible: true,
        clientLabel: 'Concluído',
      },
      {
        organizationId: org!.id,
        workflowId: defaultWorkflow!.id,
        name: 'Cancelada',
        position: 5,
        category: 'cancelled',
        clientVisible: true,
        clientLabel: 'Cancelado',
      },
    ]);

    const [defaultCategory] = await tx
      .insert(serviceCategories)
      .values({
        organizationId: org!.id,
        name: 'Societário e Regularização',
        position: 1,
      })
      .returning();

    await tx.insert(serviceTypes).values({
      organizationId: org!.id,
      categoryId: defaultCategory!.id,
      name: 'Constituição / Alteração Societária',
      defaultDepartmentId: defaultDept!.id,
      defaultWorkflowId: defaultWorkflow!.id,
      defaultDueDays: 15,
      active: true,
    });

    const [invitation] = await tx
      .insert(invitations)
      .values({
        organizationId: org!.id,
        email: normalizedEmail,
        kind: 'internal',
        role: 'org_admin',
        tokenHash,
        invitedByMembershipId: provisionerMembership!.id,
        expiresAt: inviteExpiresAt,
      })
      .returning();

    await tx.insert(activityLog).values([
      {
        organizationId: org!.id,
        actorMembershipId: provisionerMembership!.id,
        action: 'organization.provisioned',
        entityType: 'organization',
        entityId: org!.id,
        changes: { name: org!.name, slug: org!.slug },
      },
      {
        organizationId: org!.id,
        actorMembershipId: provisionerMembership!.id,
        action: 'invitation.created',
        entityType: 'invitation',
        entityId: invitation!.id,
        changes: { email: normalizedEmail, role: 'org_admin' },
      },
    ]);

    return {
      organizationId: org!.id,
      slug: org!.slug,
      name: org!.name,
      invitationId: invitation!.id,
      adminEmail: normalizedEmail,
      rawInviteToken,
      inviteExpiresAt,
    };
  });
}

/**
 * Inspeciona um token de convite bruto calculando seu SHA-256 e consultando a função
 * parametrizada `public.inspect_invitation_by_token_hash`.
 */
export async function inspectInvitationToken(
  rawToken: string,
  database: AnyPgDatabase = getDb(),
): Promise<InspectedInvitation> {
  if (!rawToken || rawToken.trim().length < 16) {
    return { status: 'not_found' };
  }

  const tokenHash = sha256Hex(rawToken.trim());

  const row = await database.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE legaas_app`);
    const raw = await tx.execute(
      sql`SELECT * FROM public.inspect_invitation_by_token_hash(${tokenHash}::text)`,
    );
    const rows = extractRows<{
      invitation_id: string;
      organization_id: string;
      org_name: string;
      org_slug: string;
      email: string;
      kind: MembershipKind;
      role: MembershipRole;
      expires_at: Date | string;
      accepted_at: Date | string | null;
      revoked_at: Date | string | null;
    }>(raw);
    return rows[0] ?? null;
  });

  if (!row) {
    return { status: 'not_found' };
  }

  const expiresAt = new Date(row.expires_at);

  if (row.revoked_at) {
    return { status: 'revoked', organizationName: row.org_name };
  }

  if (row.accepted_at) {
    return { status: 'accepted', organizationName: row.org_name };
  }

  if (expiresAt.getTime() <= Date.now()) {
    return { status: 'expired', organizationName: row.org_name };
  }

  return {
    status: 'valid',
    invitationId: row.invitation_id,
    organizationId: row.organization_id,
    organizationName: row.org_name,
    organizationSlug: row.org_slug,
    email: row.email,
    kind: row.kind,
    role: row.role,
    expiresAt,
  };
}

/**
 * Aceita um convite de uso único (Decisão A4):
 * - Valida que o token existe, não expirou, não foi revogado e não foi utilizado.
 * - Cria ou atualiza o registro em `users` e a credencial em `accounts`.
 * - Dentro de `withTenant({ organizationId })`, cria a `membership` ativa, marca
 *   `invitations.accepted_at = now()` e grava `invitation.accepted` no `activity_log`.
 */
export async function acceptInvitation(
  params: {
    rawToken: string;
    name: string;
    password: string;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{
  userId: string;
  membershipId: string;
  organizationId: string;
  organizationSlug: string;
  email: string;
}> {
  const inspected = await inspectInvitationToken(params.rawToken, database);

  if (
    inspected.status !== 'valid' ||
    !inspected.organizationId ||
    !inspected.invitationId ||
    !inspected.email
  ) {
    throw new ValidationError(
      inspected.status === 'accepted'
        ? 'Este convite já foi utilizado.'
        : inspected.status === 'expired'
          ? 'Este convite expirou. Solicite um novo convite ao administrador da organização.'
          : 'Convite inválido ou indisponível.',
    );
  }

  const passwordHash = await hashPassword(params.password);
  const normalizedEmail = inspected.email.toLowerCase();

  // 1. Garante o usuário e a credencial global
  const userRecord = await database.transaction(async (tx) => {
    let [existingUser] = await tx
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!existingUser) {
      [existingUser] = await tx
        .insert(users)
        .values({
          name: params.name.trim(),
          email: normalizedEmail,
          emailVerified: true,
          status: 'active',
        })
        .returning();
    } else {
      [existingUser] = await tx
        .update(users)
        .set({
          name: params.name.trim(),
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();
    }

    const [existingAccount] = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, existingUser!.id), eq(accounts.providerId, 'credential')))
      .limit(1);

    if (!existingAccount) {
      await tx.insert(accounts).values({
        userId: existingUser!.id,
        accountId: existingUser!.id,
        providerId: 'credential',
        password: passwordHash,
      });
    } else {
      await tx
        .update(accounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, existingAccount.id));
    }

    return existingUser!;
  });

  // 2. Cria a membership e consome o convite dentro do contexto RLS da organização
  const membershipRecord = await withTenant(
    { organizationId: inspected.organizationId },
    async (tx) => {
      const [currentInvite] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.id, inspected.invitationId!))
        .limit(1);

      if (!currentInvite || currentInvite.acceptedAt || currentInvite.revokedAt) {
        throw new ConflictError('Este convite já foi processado.');
      }

      const [existingMembership] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, inspected.organizationId!),
            eq(memberships.userId, userRecord.id),
          ),
        )
        .limit(1);

      let activeMembership = existingMembership;
      if (!activeMembership) {
        [activeMembership] = await tx
          .insert(memberships)
          .values({
            organizationId: inspected.organizationId!,
            userId: userRecord.id,
            kind: inspected.kind ?? 'internal',
            role: inspected.role ?? 'analyst',
            status: 'active',
          })
          .returning();
      } else {
        [activeMembership] = await tx
          .update(memberships)
          .set({
            status: 'active',
            role: inspected.role ?? activeMembership.role,
            updatedAt: new Date(),
          })
          .where(eq(memberships.id, activeMembership.id))
          .returning();
      }

      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, currentInvite.id));

      await tx.insert(activityLog).values({
        organizationId: inspected.organizationId!,
        actorMembershipId: activeMembership!.id,
        action: 'invitation.accepted',
        entityType: 'invitation',
        entityId: currentInvite.id,
        changes: {
          userId: userRecord.id,
          email: normalizedEmail,
          role: activeMembership!.role,
        },
      });

      return activeMembership!;
    },
    database,
  );

  return {
    userId: userRecord.id,
    membershipId: membershipRecord.id,
    organizationId: inspected.organizationId,
    organizationSlug: inspected.organizationSlug!,
    email: normalizedEmail,
  };
}

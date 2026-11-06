import { ShieldAlert } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { can } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { NotFoundError } from '@/server/errors/app-error';
import { listOrganizationMembers } from '@/server/modules/members/service';
import { MembersManagementClient } from './_components/members-management-client';

interface UsersPageProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * Tela de Gestão de Usuários e Permissões (`/[orgSlug]/usuarios` — Fase 1.2):
 * - Protegida por validação de sessão, Membership ativa e permissão administrativa `org_admin`.
 */
export default async function OfficeUsersPage({ params }: UsersPageProps) {
  const { orgSlug } = await params;

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && orgSlug === 'demonstracao-dev') {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Administração · /${orgSlug}/usuarios`}
          title="Usuários e Permissões"
          description="Gerencie os membros da organização, envie convites com papéis RBAC e revogue acessos."
        />
        <MembersManagementClient
          orgSlug={orgSlug}
          currentMembershipId="dev-preview-membership"
          members={[]}
          pendingInvitations={[]}
        />
      </div>
    );
  }

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    redirect(`/login?next=/${encodeURIComponent(orgSlug)}/usuarios`);
  }

  let tenantCtx;
  try {
    tenantCtx = await resolveOfficeTenantContext({
      userId: session.userId,
      orgSlug,
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }

  // Proteção RBAC da rota de gestão de membros: restrita ao papel org_admin
  if (!can(tenantCtx, 'member.invite')) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Administração · /${orgSlug}/usuarios`}
          title="Usuários e Permissões"
          description="Controle de acesso e gestão de membros da organização."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Acesso restrito a Administradores da Organização (403)"
          description="Seu papel atual nesta organização não possui permissão para gerenciar usuários, convites ou papéis de acesso."
        />
      </div>
    );
  }

  const directory = await listOrganizationMembers(tenantCtx);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Administração · /${orgSlug}/usuarios`}
        title="Usuários e Permissões"
        description="Gerencie os membros internos da organização, envie convites de uso único com papéis predefinidos e controle a ativação de acessos."
      />

      <MembersManagementClient
        orgSlug={tenantCtx.orgSlug}
        currentMembershipId={tenantCtx.membershipId}
        members={directory.members.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        }))}
        pendingInvitations={directory.pendingInvitations.map((inv) => ({
          ...inv,
          expiresAt: inv.expiresAt.toISOString(),
          createdAt: inv.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}

import { ShieldAlert } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { can } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { NotFoundError } from '@/server/errors/app-error';
import { listOrganizationDepartments } from '@/server/modules/departments/service';
import { listOrganizationMembers } from '@/server/modules/members/service';
import { DepartmentsManagementClient } from './_components/departments-management-client';

interface DepartmentsPageProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * Tela de Gestão de Departamentos e Equipes (`/[orgSlug]/departamentos` — Fase 1.3):
 * - Protegida por validação de sessão, Membership ativa e permissão administrativa `org_admin`.
 */
export default async function OfficeDepartmentsPage({ params }: DepartmentsPageProps) {
  const { orgSlug } = await params;

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && orgSlug === 'demonstracao-dev') {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Administração · /${orgSlug}/departamentos`}
          title="Departamentos e Equipes"
          description="Estruture os departamentos operacionais e aloque membros, coordenadores e gestores."
        />
        <DepartmentsManagementClient orgSlug={orgSlug} departments={[]} activeMembers={[]} />
      </div>
    );
  }

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    redirect(`/login?next=/${encodeURIComponent(orgSlug)}/departamentos`);
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

  // Proteção RBAC da rota de gestão de departamentos: restrita ao papel org_admin
  if (!can(tenantCtx, 'department.create')) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Administração · /${orgSlug}/departamentos`}
          title="Departamentos e Equipes"
          description="Estruturação departamental e alocação de equipes da organização."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Acesso restrito a Administradores da Organização (403)"
          description="Seu papel atual nesta organização não possui permissão para criar, editar ou gerenciar a alocação de departamentos."
        />
      </div>
    );
  }

  const [departmentsList, directory] = await Promise.all([
    listOrganizationDepartments(tenantCtx),
    listOrganizationMembers(tenantCtx),
  ]);

  const activeMembers = directory.members
    .filter((m) => m.status === 'active')
    .map((m) => ({
      membershipId: m.membershipId,
      name: m.name,
      email: m.email,
      role: m.role,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Administração · /${orgSlug}/departamentos`}
        title="Departamentos e Equipes"
        description="Estruture os departamentos operacionais da organização e vincule membros, coordenadores e gestores para delimitar o escopo RBAC."
      />

      <DepartmentsManagementClient
        orgSlug={tenantCtx.orgSlug}
        departments={departmentsList.map((dept) => ({
          ...dept,
          createdAt: dept.createdAt.toISOString(),
        }))}
        activeMembers={activeMembers}
      />
    </div>
  );
}

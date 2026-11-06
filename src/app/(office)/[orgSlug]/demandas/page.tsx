import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { can } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { NotFoundError } from '@/server/errors/app-error';
import { listOrganizationClients } from '@/server/modules/clients/service';
import { listOrganizationCompanies } from '@/server/modules/companies/service';
import {
  type DemandPriority,
  listDemandCatalogMetadata,
  listOrganizationDemands,
  type WorkflowStageCategory,
} from '@/server/modules/demands/service';
import { listOrganizationDepartments } from '@/server/modules/departments/service';
import { listOrganizationMembers } from '@/server/modules/members/service';
import { DemandsListClient, type DemandViewMode } from './_components/demands-list-client';

interface DemandsPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    search?: string;
    clientId?: string;
    companyId?: string;
    departmentId?: string;
    status?: string;
    assigneeId?: string;
    priority?: string;
    view?: string;
  }>;
}

const VALID_STATUS_CATEGORIES = new Set<WorkflowStageCategory>([
  'backlog',
  'active',
  'waiting',
  'done',
  'cancelled',
]);

const VALID_PRIORITIES = new Set<DemandPriority>(['low', 'medium', 'high', 'urgent']);

/**
 * Tela Operacional de Demandas / Ordens de Serviço (`/[orgSlug]/demandas` — Fase 1.6):
 * - Suporta DataTable, Lista Compacta e Quadro Kanban.
 * - Filtros combináveis por busca, cliente, empresa, departamento, status derivado, analista e prioridade.
 * - Respeita estritamente o escopo RBAC por departamento (Decisão A5) e a FK tripla Cliente–Empresa (Decisão A2).
 */
export default async function OfficeDemandsPage({ params, searchParams }: DemandsPageProps) {
  const { orgSlug } = await params;
  const query = await searchParams;

  const validView: DemandViewMode =
    query.view === 'list' || query.view === 'kanban' ? query.view : 'table';

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && orgSlug === 'demonstracao-dev') {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Operação · /${orgSlug}/demandas`}
          title="Demandas e Ordens de Serviço"
          description="Gerencie solicitações operacionais, workflows por departamento, prazos fatais e responsáveis com rastreabilidade completa."
        />
        <DemandsListClient
          orgSlug={orgSlug}
          canCreateDemand={true}
          actorDepartmentIds={[]}
          actorRole="org_admin"
          actorMembershipId=""
          demands={[]}
          clients={[]}
          companies={[]}
          departments={[]}
          members={[]}
          serviceTypes={[]}
          stages={[]}
          initialFilters={{
            search: query.search ?? '',
            clientId: query.clientId ?? '',
            companyId: query.companyId ?? '',
            departmentId: query.departmentId ?? '',
            statusCategory: query.status ?? '',
            assigneeMembershipId: query.assigneeId ?? '',
            priority: query.priority ?? '',
            view: validView,
          }}
        />
      </div>
    );
  }

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    redirect(`/login?next=/${encodeURIComponent(orgSlug)}/demandas`);
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

  const validStatusCategory =
    query.status && VALID_STATUS_CATEGORIES.has(query.status as WorkflowStageCategory)
      ? (query.status as WorkflowStageCategory)
      : undefined;

  const validPriority =
    query.priority && VALID_PRIORITIES.has(query.priority as DemandPriority)
      ? (query.priority as DemandPriority)
      : undefined;

  const [demandsList, catalogMetadata, clientsList, companiesList, departmentsList, membersList] =
    await Promise.all([
      listOrganizationDemands(tenantCtx, {
        search: query.search,
        clientId: query.clientId || undefined,
        companyId: query.companyId || undefined,
        departmentId: query.departmentId || undefined,
        statusCategory: validStatusCategory,
        assigneeMembershipId: query.assigneeId || undefined,
        priority: validPriority,
      }),
      listDemandCatalogMetadata(tenantCtx),
      listOrganizationClients(tenantCtx, { status: 'active' }),
      listOrganizationCompanies(tenantCtx, { status: 'active' }),
      listOrganizationDepartments(tenantCtx),
      listOrganizationMembers(tenantCtx),
    ]);

  const canCreateDemand = can(tenantCtx, 'demand.create');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Operação · /${orgSlug}/demandas`}
        title="Demandas e Ordens de Serviço"
        description="Gerencie o ciclo de vida das ordens de serviço, etapas de workflow, departamentos responsáveis, analistas atribuídos e prazos fatais."
      />

      <DemandsListClient
        orgSlug={tenantCtx.orgSlug}
        canCreateDemand={canCreateDemand}
        actorDepartmentIds={tenantCtx.departmentIds}
        actorRole={tenantCtx.role}
        actorMembershipId={tenantCtx.membershipId}
        demands={demandsList.map((d) => ({
          ...d,
          openedAt: d.openedAt.toISOString(),
          completedAt: d.completedAt ? d.completedAt.toISOString() : null,
          updatedAt: d.updatedAt.toISOString(),
        }))}
        clients={clientsList.map((c) => ({ id: c.id, name: c.name }))}
        companies={companiesList.map((comp) => ({
          id: comp.id,
          clientId: comp.clientId,
          legalName: comp.legalName,
          cnpj: comp.cnpj,
        }))}
        departments={departmentsList.map((dept) => ({
          id: dept.id,
          name: dept.name,
        }))}
        members={membersList.members
          .filter((m) => m.status === 'active')
          .map((m) => ({
            membershipId: m.membershipId,
            name: m.name,
            email: m.email,
            role: m.role,
          }))}
        serviceTypes={catalogMetadata.serviceTypes}
        stages={catalogMetadata.stages}
        initialFilters={{
          search: query.search ?? '',
          clientId: query.clientId ?? '',
          companyId: query.companyId ?? '',
          departmentId: query.departmentId ?? '',
          statusCategory: validStatusCategory ?? '',
          assigneeMembershipId: query.assigneeId ?? '',
          priority: validPriority ?? '',
          view: validView,
        }}
      />
    </div>
  );
}

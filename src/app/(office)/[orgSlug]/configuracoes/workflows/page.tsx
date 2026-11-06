import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { can } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { NotFoundError } from '@/server/errors/app-error';
import { listOrganizationDepartments } from '@/server/modules/departments/service';
import { listOrganizationWorkflowsCatalog } from '@/server/modules/workflows/service';
import { WorkflowsManagementClient } from './_components/workflows-management-client';

interface WorkflowsPageProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * Tela de Configuração de Esteiras e Workflows (`/[orgSlug]/configuracoes/workflows` — Fase 1.7):
 * - Lista todas as esteiras ativas, etapas ordenadas (com etapa inicial e mapeamento canônico Decisão A6),
 *   regras/bloqueios de transição (`workflow_transitions`) e associação com tipos de serviço (`service_types`).
 */
export default async function OfficeWorkflowsPage({ params }: WorkflowsPageProps) {
  const { orgSlug } = await params;

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && orgSlug === 'demonstracao-dev') {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Configurações · /${orgSlug}/configuracoes/workflows`}
          title="Workflows, Etapas e Regras de Transição"
          description="Administre esteiras de atendimento personalizadas, ordenação de etapas, etapa inicial, categorias canônicas de status e bloqueios de transição."
        />
        <WorkflowsManagementClient
          orgSlug={orgSlug}
          canWrite={true}
          workflows={[]}
          serviceCategories={[]}
          serviceTypes={[]}
          departments={[]}
        />
      </div>
    );
  }

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    redirect(`/login?next=/${encodeURIComponent(orgSlug)}/configuracoes/workflows`);
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

  const [catalog, departmentsList] = await Promise.all([
    listOrganizationWorkflowsCatalog(tenantCtx),
    listOrganizationDepartments(tenantCtx),
  ]);

  const canWrite = can(tenantCtx, 'workflow.write');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Configurações · /${orgSlug}/configuracoes/workflows`}
        title="Workflows, Etapas e Regras de Transição"
        description="Administre esteiras de atendimento personalizadas por tipo de serviço, ordenação de etapas, etapa inicial, categorias canônicas (Decisão A6) e bloqueios de transição."
      />

      <WorkflowsManagementClient
        orgSlug={tenantCtx.orgSlug}
        canWrite={canWrite}
        workflows={catalog.workflows.map((wf) => ({
          ...wf,
          createdAt: wf.createdAt.toISOString(),
          updatedAt: wf.updatedAt.toISOString(),
        }))}
        serviceCategories={catalog.serviceCategories}
        serviceTypes={catalog.serviceTypes}
        departments={departmentsList.map((d) => ({
          id: d.id,
          name: d.name,
        }))}
      />
    </div>
  );
}

import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { can } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { NotFoundError } from '@/server/errors/app-error';
import { type EntityStatus, listOrganizationClients } from '@/server/modules/clients/service';
import { listOrganizationCompanies } from '@/server/modules/companies/service';
import { CompaniesManagementClient } from './_components/companies-management-client';

interface CompaniesPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    search?: string;
    clientId?: string;
    status?: string;
  }>;
}

/**
 * Tela de Gestão de Empresas e Grupos Empresariais (`/[orgSlug]/empresas` — Fase 1.5):
 * - Suporta pesquisa, filtros por cliente e status, cadastro/edição de pessoas jurídicas,
 *   dados cadastrais completos (CNPJ, IE/IM, endereço) e hierarquia societária (`parent_company_id`).
 */
export default async function OfficeCompaniesPage({ params, searchParams }: CompaniesPageProps) {
  const { orgSlug } = await params;
  const query = await searchParams;

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && orgSlug === 'demonstracao-dev') {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Operação · /${orgSlug}/empresas`}
          title="Empresas e Pessoas Jurídicas"
          description="Administre CNPJs, endereços, inscrições e estrutura societária (holdings e controladas) vinculados aos clientes."
        />
        <CompaniesManagementClient
          orgSlug={orgSlug}
          canWrite={true}
          companies={[]}
          clientOptions={[]}
          initialSearch={query.search ?? ''}
          initialClientId={query.clientId ?? ''}
          initialStatus={query.status ?? ''}
        />
      </div>
    );
  }

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    redirect(`/login?next=/${encodeURIComponent(orgSlug)}/empresas`);
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

  const validStatus: EntityStatus | undefined =
    query.status === 'active' || query.status === 'inactive' ? query.status : undefined;

  const [companiesList, clientsList] = await Promise.all([
    listOrganizationCompanies(tenantCtx, {
      search: query.search,
      clientId: query.clientId || undefined,
      status: validStatus,
    }),
    listOrganizationClients(tenantCtx, { status: 'active' }),
  ]);

  const clientOptions = clientsList.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const canWrite = can(tenantCtx, 'company.write');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Operação · /${orgSlug}/empresas`}
        title="Empresas e Pessoas Jurídicas"
        description="Administre CNPJs, inscrições estaduais/municipais, endereços e estrutura societária (holdings e controladas) vinculados aos clientes da organização."
      />

      <CompaniesManagementClient
        orgSlug={tenantCtx.orgSlug}
        canWrite={canWrite}
        companies={companiesList.map((comp) => ({
          ...comp,
          createdAt: comp.createdAt.toISOString(),
          updatedAt: comp.updatedAt.toISOString(),
        }))}
        clientOptions={clientOptions}
        initialSearch={query.search ?? ''}
        initialClientId={query.clientId ?? ''}
        initialStatus={validStatus ?? ''}
      />
    </div>
  );
}

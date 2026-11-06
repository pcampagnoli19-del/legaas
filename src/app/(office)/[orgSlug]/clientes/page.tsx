import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { can } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { NotFoundError } from '@/server/errors/app-error';
import {
  type ClientType,
  type EntityStatus,
  listOrganizationClients,
} from '@/server/modules/clients/service';
import { listOrganizationMembers } from '@/server/modules/members/service';
import { ClientsManagementClient } from './_components/clients-management-client';

interface ClientsPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    search?: string;
    status?: string;
    type?: string;
  }>;
}

/**
 * Tela de Gestão de Clientes (`/[orgSlug]/clientes` — Fase 1.4):
 * - Suporta pesquisa, filtros por natureza (PF/PJ) e status, cadastro/edição de clientes,
 *   gestão de contatos vinculados e navegação para empresas associadas.
 */
export default async function OfficeClientsPage({ params, searchParams }: ClientsPageProps) {
  const { orgSlug } = await params;
  const query = await searchParams;

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && orgSlug === 'demonstracao-dev') {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Operação · /${orgSlug}/clientes`}
          title="Gestão de Clientes"
          description="Administre a carteira de clientes (PF/PJ), contatos de relacionamento e responsáveis internos."
        />
        <ClientsManagementClient
          orgSlug={orgSlug}
          canWrite={true}
          clients={[]}
          ownerOptions={[]}
          initialSearch={query.search ?? ''}
          initialStatus={query.status ?? ''}
          initialType={query.type ?? ''}
        />
      </div>
    );
  }

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    redirect(`/login?next=/${encodeURIComponent(orgSlug)}/clientes`);
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
  const validType: ClientType | undefined =
    query.type === 'individual' || query.type === 'organization' ? query.type : undefined;

  const [clientsList, teamDirectory] = await Promise.all([
    listOrganizationClients(tenantCtx, {
      search: query.search,
      status: validStatus,
      type: validType,
    }),
    listOrganizationMembers(tenantCtx),
  ]);

  const ownerOptions = teamDirectory.members
    .filter((m) => m.status === 'active')
    .map((m) => ({
      membershipId: m.membershipId,
      name: m.name,
      email: m.email,
    }));

  const canWrite = can(tenantCtx, 'client.write');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Operação · /${orgSlug}/clientes`}
        title="Gestão de Clientes"
        description="Administre a carteira de clientes (PF/PJ e grupos empresariais), contatos de relacionamento e responsáveis internos da organização."
      />

      <ClientsManagementClient
        orgSlug={tenantCtx.orgSlug}
        canWrite={canWrite}
        clients={clientsList.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          contacts: c.contacts.map((ct) => ({
            ...ct,
            createdAt: ct.createdAt.toISOString(),
          })),
        }))}
        ownerOptions={ownerOptions}
        initialSearch={query.search ?? ''}
        initialStatus={validStatus ?? ''}
        initialType={validType ?? ''}
      />
    </div>
  );
}

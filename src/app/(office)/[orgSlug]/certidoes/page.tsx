import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { getServerEnv } from '@/env';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { can } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { NotFoundError } from '@/server/errors/app-error';
import {
  CERTIFICATE_TYPES,
  type CertificateTypeCode,
} from '@/server/modules/certificates/groq-extractor';
import {
  type CertificateValidityStatus,
  getOrganizationExpirationAlerts,
  listOrganizationCertificates,
} from '@/server/modules/certificates/service';
import { listOrganizationClients } from '@/server/modules/clients/service';
import { listOrganizationCompanies } from '@/server/modules/companies/service';
import { listOrganizationDemands } from '@/server/modules/demands/service';
import { CertificatesManagementClient } from './_components/certificates-management-client';

interface CertificatesPageProps {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    search?: string;
    clientId?: string;
    companyId?: string;
    type?: string;
    status?: string;
  }>;
}

const VALID_STATUS = new Set<CertificateValidityStatus>([
  'expired',
  'expiring_soon',
  'valid',
  'no_expiration',
]);

/**
 * Tela Operacional de Gestão de Certidões e Validades com IA (Groq) (`/[orgSlug]/certidoes` — Fase 1.8):
 * - Fluxo de upload de PDFs de certidões (CNDs Federais, CRF FGTS, CNDT, SEFAZ, Prefeitura, Junta Comercial, AVCB).
 * - Extração automática de datas de emissão e validade via API da Groq (`llama-3.3-70b-versatile`) com fallback determinístico.
 * - Motor de alertas de vencimento integrado às demandas e empresas da organização.
 */
export default async function OfficeCertificatesPage({
  params,
  searchParams,
}: CertificatesPageProps) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const env = getServerEnv();
  const groqConfigured = Boolean(env.GROQ_API_KEY?.trim());

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && orgSlug === 'demonstracao-dev') {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Compliance e Regularidade · /${orgSlug}/certidoes`}
          title="Gestão de Certidões e Validades (IA Groq)"
          description="Envie PDFs de CNDs, CRF FGTS, CNDT e alvarás para extração automática de validades via IA Groq e monitoramento de vencimentos."
        />
        <CertificatesManagementClient
          orgSlug={orgSlug}
          canWriteDocuments={true}
          groqConfigured={groqConfigured}
          groqModel={env.GROQ_MODEL}
          certificates={[]}
          alertsDashboard={{
            summary: {
              totalTrackedCertificates: 0,
              expiredCount: 0,
              critical7DaysCount: 0,
              warning30DaysCount: 0,
              validCount: 0,
              activeTriggeredAlertsCount: 0,
            },
            alerts: [],
          }}
          clients={[]}
          companies={[]}
          demands={[]}
          initialFilters={{
            search: query.search ?? '',
            clientId: query.clientId ?? '',
            companyId: query.companyId ?? '',
            certificateType: query.type ?? '',
            validityStatus: query.status ?? '',
          }}
        />
      </div>
    );
  }

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    redirect(`/login?next=/${encodeURIComponent(orgSlug)}/certidoes`);
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

  const validType =
    query.type && CERTIFICATE_TYPES.includes(query.type as CertificateTypeCode)
      ? (query.type as CertificateTypeCode)
      : undefined;

  const validStatus =
    query.status && VALID_STATUS.has(query.status as CertificateValidityStatus)
      ? (query.status as CertificateValidityStatus)
      : undefined;

  const [certificatesList, alertsDashboard, clientsList, companiesList, demandsList] =
    await Promise.all([
      listOrganizationCertificates(tenantCtx, {
        search: query.search,
        clientId: query.clientId || undefined,
        companyId: query.companyId || undefined,
        certificateType: validType,
        validityStatus: validStatus,
      }),
      getOrganizationExpirationAlerts(tenantCtx),
      listOrganizationClients(tenantCtx, { status: 'active' }),
      listOrganizationCompanies(tenantCtx, { status: 'active' }),
      listOrganizationDemands(tenantCtx),
    ]);

  const canWriteDocuments = can(tenantCtx, 'document.write');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Compliance e Regularidade · /${orgSlug}/certidoes`}
        title="Gestão de Certidões e Validades (IA Groq)"
        description="Faça upload de PDFs de certidões (CND Federal, CRF FGTS, CNDT, Estadual, Municipal, Junta Comercial e AVCB) com extração automática de datas de validade pela IA Groq e alertas preventivos de vencimento."
      />

      <CertificatesManagementClient
        orgSlug={tenantCtx.orgSlug}
        canWriteDocuments={canWriteDocuments}
        groqConfigured={groqConfigured}
        groqModel={env.GROQ_MODEL}
        certificates={certificatesList.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        }))}
        alertsDashboard={alertsDashboard}
        clients={clientsList.map((c) => ({ id: c.id, name: c.name }))}
        companies={companiesList.map((comp) => ({
          id: comp.id,
          clientId: comp.clientId,
          legalName: comp.legalName,
          cnpj: comp.cnpj,
        }))}
        demands={demandsList.map((d) => ({
          id: d.id,
          code: d.code,
          title: d.title,
          clientId: d.clientId,
          companyId: d.companyId,
        }))}
        initialFilters={{
          search: query.search ?? '',
          clientId: query.clientId ?? '',
          companyId: query.companyId ?? '',
          certificateType: validType ?? '',
          validityStatus: validStatus ?? '',
        }}
      />
    </div>
  );
}

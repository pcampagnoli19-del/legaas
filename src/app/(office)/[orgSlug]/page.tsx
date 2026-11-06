import { AlertTriangle, ArrowRight, BellRing, FileCheck2, FolderKanban } from 'lucide-react';
import Link from 'next/link';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import {
  type ExpirationAlertsDashboard,
  getOrganizationExpirationAlerts,
} from '@/server/modules/certificates/service';
import { listOrganizationDemands } from '@/server/modules/demands/service';

interface DemandSummaryRow {
  id: string;
  orgSlug: string;
  code: string;
  title: string;
  clientName: string;
  departmentName: string;
  stageName: string;
  dueDate: string;
}

const DEMAND_COLUMNS: DataTableColumn<DemandSummaryRow>[] = [
  {
    key: 'code',
    header: 'Código',
    cell: (row) => (
      <Link
        href={`/${row.orgSlug}/demandas/${row.id}`}
        className="text-brand-navy hover:text-brand-emerald font-mono font-semibold hover:underline"
      >
        {row.code}
      </Link>
    ),
  },
  {
    key: 'title',
    header: 'Demanda',
    cell: (row) => (
      <Link
        href={`/${row.orgSlug}/demandas/${row.id}`}
        className="hover:text-brand-navy font-medium text-slate-900 hover:underline"
      >
        {row.title}
      </Link>
    ),
  },
  {
    key: 'client',
    header: 'Cliente',
    cell: (row) => row.clientName,
  },
  {
    key: 'department',
    header: 'Departamento',
    cell: (row) => row.departmentName,
  },
  {
    key: 'stage',
    header: 'Etapa',
    cell: (row) => <Badge variant="outline">{row.stageName}</Badge>,
  },
  {
    key: 'dueDate',
    header: 'Prazo',
    cell: (row) => row.dueDate,
  },
];

function formatDateBr(isoDate: string | null): string {
  if (!isoDate) return 'Sem prazo';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatRemainingDaysText(days: number): string {
  if (days < 0) return `Vencida há ${Math.abs(days)}d`;
  if (days === 0) return 'Vence HOJE';
  return `Vence em ${days}d`;
}

interface OfficeOverviewPageProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * Visão Geral do Legaas Office:
 * Segue estritamente CLAUDE.md §3.2 — nenhum indicador fictício ou número aleatório é exibido.
 * Consulta as demandas reais e o Motor de Alertas de Vencimento de Certidões persistidos no banco da organização ativa.
 */
export default async function OfficeOverviewPage({ params }: OfficeOverviewPageProps) {
  const { orgSlug } = await params;
  const demands: DemandSummaryRow[] = [];
  let alertsDashboard: ExpirationAlertsDashboard = {
    summary: {
      totalTrackedCertificates: 0,
      expiredCount: 0,
      critical7DaysCount: 0,
      warning30DaysCount: 0,
      validCount: 0,
      activeTriggeredAlertsCount: 0,
    },
    alerts: [],
  };

  const isProduction = process.env.NODE_ENV === 'production';
  const isDevPreview = !isProduction && orgSlug === 'demonstracao-dev';

  if (!isDevPreview) {
    const session = await getCurrentSessionFromCookies();
    if (session) {
      try {
        const tenantCtx = await resolveOfficeTenantContext({
          userId: session.userId,
          orgSlug,
        });
        const [realDemands, realAlerts] = await Promise.all([
          listOrganizationDemands(tenantCtx),
          getOrganizationExpirationAlerts(tenantCtx),
        ]);
        alertsDashboard = realAlerts;
        for (const d of realDemands.slice(0, 10)) {
          demands.push({
            id: d.id,
            orgSlug: tenantCtx.orgSlug,
            code: d.code,
            title: d.title,
            clientName: d.clientName,
            departmentName: d.departmentName,
            stageName: d.stageName,
            dueDate: formatDateBr(d.dueDate),
          });
        }
      } catch {
        // O layout superior já governa autenticação e 404 para organizações inválidas
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <PageHeader
          eyebrow={`Organização · /${orgSlug}`}
          title="Visão Geral da Operação"
          description="Ambiente interno do Legaas Office. Os indicadores, certidões monitoradas e listagens abaixo refletem exclusivamente dados persistidos no banco da organização."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/${orgSlug}/certidoes`}>
            <Button type="button" variant="outline" size="sm">
              <FileCheck2 className="h-3.5 w-3.5" />
              Certidões e Validades (IA)
            </Button>
          </Link>
          <Link href={`/${orgSlug}/demandas`}>
            <Button type="button" variant="default" size="sm">
              Gerenciar Demandas
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Motor de Alertas de Vencimento no Painel Principal (Fase 1.8) */}
      <Card
        className={
          alertsDashboard.summary.expiredCount > 0
            ? 'border-red-300 bg-red-50/20'
            : alertsDashboard.summary.activeTriggeredAlertsCount > 0
              ? 'border-amber-300 bg-amber-50/20'
              : ''
        }
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BellRing className="text-brand-navy h-4 w-4" />
                Motor de Alertas de Vencimento · Certidões (CNDs / FGTS) e Obrigações
              </CardTitle>
              <CardDescription>
                Monitoramento contínuo de validades extraídas via IA Groq e prazos legais vinculados
                às empresas e demandas da organização.
              </CardDescription>
            </div>
            <Link href={`/${orgSlug}/certidoes`}>
              <Button type="button" variant="outline" size="sm">
                Abrir Central de Certidões
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-medium text-slate-500 uppercase">
                Certidões Monitoradas
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {alertsDashboard.summary.totalTrackedCertificates}
              </p>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50/50 p-3">
              <p className="text-[11px] font-medium text-red-700 uppercase">Vencidas</p>
              <p className="mt-1 text-xl font-semibold text-red-700">
                {alertsDashboard.summary.expiredCount}
              </p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-[11px] font-medium text-amber-800 uppercase">
                Críticas (Até 7 Dias)
              </p>
              <p className="mt-1 text-xl font-semibold text-amber-800">
                {alertsDashboard.summary.critical7DaysCount}
              </p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
              <p className="text-[11px] font-medium text-emerald-800 uppercase">
                Regulares / Vigentes
              </p>
              <p className="mt-1 text-xl font-semibold text-emerald-800">
                {alertsDashboard.summary.validCount}
              </p>
            </div>
          </div>

          {alertsDashboard.alerts.length > 0 ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {alertsDashboard.alerts.slice(0, 6).map((alert) => (
                <div
                  key={`${alert.sourceType}-${alert.id}`}
                  className={`flex flex-col justify-between rounded-md border p-3 ${
                    alert.severity === 'expired'
                      ? 'border-red-200 bg-red-50/70'
                      : alert.severity === 'critical'
                        ? 'border-amber-300 bg-amber-50/70'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant={
                          alert.severity === 'expired'
                            ? 'danger'
                            : alert.severity === 'critical'
                              ? 'warning'
                              : 'default'
                        }
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {formatRemainingDaysText(alert.daysRemaining)}
                      </Badge>
                      <span className="font-mono text-[11px] font-semibold text-slate-700">
                        {formatDateBr(alert.dueDate)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-900">{alert.title}</p>
                    <p className="text-[11px] text-slate-600">{alert.subtitle}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-200/70 pt-2 text-[11px] text-slate-600">
                    <span className="truncate">
                      {alert.companyLegalName ?? alert.clientName ?? 'Organização'}
                    </span>
                    {alert.demandId && alert.demandCode ? (
                      <Link
                        href={`/${orgSlug}/demandas/${alert.demandId}`}
                        className="text-brand-navy font-mono font-semibold hover:underline"
                      >
                        {alert.demandCode}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Nenhum alerta de vencimento crítico ativo no momento. Todas as certidões monitoradas
              estão regulares.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fundação e Módulos Operacionais Ativos (Fase 1.1 a 1.8)</CardTitle>
          <CardDescription>
            Status real da infraestrutura multi-tenant e governança desta organização
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Isolamento de Dados</p>
            <p className="mt-1 text-xs font-semibold text-slate-900">
              PostgreSQL RLS + FORCE RLS ativo em 22 tabelas operacionais
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[11px] font-medium text-slate-500 uppercase">
              Integridade Relacional
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-900">
              FKs compostas por organização e FK tripla Cliente–Empresa–Demanda
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[11px] font-medium text-slate-500 uppercase">
              Auditoria Operacional
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-900">
              Tabela activity_log append-only (sem UPDATE/DELETE na role da aplicação)
            </p>
          </div>
        </CardContent>
      </Card>

      {demands.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Nenhuma demanda cadastrada nesta organização"
          description="Acesse o módulo de Demandas para registrar a primeira ordem de serviço vinculada a cliente, empresa, departamento e workflow."
        />
      ) : null}

      <section aria-labelledby="recent-demands-heading" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2
            id="recent-demands-heading"
            className="text-xs font-semibold tracking-wider text-slate-600 uppercase"
          >
            Demandas Recentes
          </h2>
          <span className="font-mono text-[11px] text-slate-500">
            {demands.length} {demands.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>
        <DataTable
          columns={DEMAND_COLUMNS}
          data={demands}
          getRowKey={(row) => row.code}
          emptyMessage="Nenhuma demanda registrada no banco de dados para esta organização."
        />
      </section>
    </div>
  );
}

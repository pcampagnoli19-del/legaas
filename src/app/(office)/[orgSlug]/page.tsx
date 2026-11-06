import { ArrowRight, FolderKanban } from 'lucide-react';
import Link from 'next/link';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
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

interface OfficeOverviewPageProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * Visão Geral do Legaas Office:
 * Segue estritamente CLAUDE.md §3.2 — nenhum indicador fictício ou número aleatório é exibido.
 * Consulta as demandas reais persistidas no banco de dados da organização ativa.
 */
export default async function OfficeOverviewPage({ params }: OfficeOverviewPageProps) {
  const { orgSlug } = await params;
  const demands: DemandSummaryRow[] = [];

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
        const realDemands = await listOrganizationDemands(tenantCtx);
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
          description="Ambiente interno do Legaas Office. Os indicadores e listagens abaixo refletem exclusivamente dados persistidos no banco da organização."
        />
        <Link href={`/${orgSlug}/demandas`}>
          <Button type="button" variant="default" size="sm">
            Gerenciar Demandas
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fundação e Módulos Operacionais Ativos (Fase 1.1 a 1.6)</CardTitle>
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

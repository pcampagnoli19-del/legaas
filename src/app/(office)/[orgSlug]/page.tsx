import { FolderKanban } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DemandSummaryRow {
  code: string;
  title: string;
  clientName: string;
  stageName: string;
  dueDate: string;
}

const DEMAND_COLUMNS: DataTableColumn<DemandSummaryRow>[] = [
  {
    key: 'code',
    header: 'Código',
    cell: (row) => <span className="font-mono font-medium">{row.code}</span>,
  },
  {
    key: 'title',
    header: 'Demanda',
    cell: (row) => row.title,
  },
  {
    key: 'client',
    header: 'Cliente',
    cell: (row) => row.clientName,
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

interface OfficeOverviewPageProps {
  params: Promise<{ orgSlug: string }>;
}

/**
 * Visão Geral do Legaas Office (Fase 0.10):
 * Segue estritamente CLAUDE.md §3.2 — nenhum indicador fictício ou número aleatório é exibido.
 */
export default async function OfficeOverviewPage({ params }: OfficeOverviewPageProps) {
  const { orgSlug } = await params;
  const demands: DemandSummaryRow[] = [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Organização · /${orgSlug}`}
        title="Visão Geral da Operação"
        description="Ambiente interno do Legaas Office. Os indicadores e listagens abaixo refletirão exclusivamente dados persistidos no banco da organização após a ativação dos módulos da Fase 1."
      />

      <Card>
        <CardHeader>
          <CardTitle>Fundação Técnica Concluída (Fase 0)</CardTitle>
          <CardDescription>
            Status real da infraestrutura multi-tenant desta organização
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

      <EmptyState
        icon={FolderKanban}
        title="Nenhuma demanda cadastrada nesta organização"
        description="Os módulos de Autenticação e Organizações (1.1), Clientes (1.4), Empresas (1.5) e Demandas (1.6) serão habilitados na Fase 1 do Roadmap."
      />

      <section aria-labelledby="recent-demands-heading" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2
            id="recent-demands-heading"
            className="text-xs font-semibold tracking-wider text-slate-600 uppercase"
          >
            Demandas Recentes
          </h2>
          <span className="font-mono text-[11px] text-slate-500">0 registros</span>
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

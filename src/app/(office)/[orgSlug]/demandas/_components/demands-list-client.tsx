'use client';

import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Columns3,
  Filter,
  Landmark,
  LayoutList,
  Plus,
  Search,
  Table2,
  UserCheck,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { FormField } from '@/components/shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createDemandAction } from '@/server/modules/demands/actions';
import type {
  DemandPriority,
  DemandServiceTypeOption,
  DemandWorkflowStageOption,
  WorkflowStageCategory,
} from '@/server/modules/demands/service';

export function formatCnpj(raw: string | null | undefined): string {
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  return raw;
}

export interface SerializedDemandSummary {
  id: string;
  number: number;
  code: string;
  title: string;
  description: string | null;
  clientId: string;
  clientName: string;
  companyId: string | null;
  companyLegalName: string | null;
  companyCnpj: string | null;
  serviceTypeId: string;
  serviceTypeName: string;
  serviceCategoryName: string;
  workflowId: string;
  stageId: string;
  stageName: string;
  statusCategory: WorkflowStageCategory;
  departmentId: string;
  departmentName: string;
  assigneeMembershipId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  priority: DemandPriority;
  dueDate: string | null;
  openedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface DemandClientOption {
  id: string;
  name: string;
}

export interface DemandCompanyOption {
  id: string;
  clientId: string;
  legalName: string;
  cnpj: string;
}

export interface DemandDepartmentOption {
  id: string;
  name: string;
}

export interface DemandMemberOption {
  membershipId: string;
  name: string;
  email: string;
  role: string;
}

export type DemandViewMode = 'table' | 'list' | 'kanban';

interface DemandsListClientProps {
  orgSlug: string;
  canCreateDemand: boolean;
  actorDepartmentIds: string[];
  actorRole: string;
  actorMembershipId: string;
  demands: SerializedDemandSummary[];
  clients: DemandClientOption[];
  companies: DemandCompanyOption[];
  departments: DemandDepartmentOption[];
  members: DemandMemberOption[];
  serviceTypes: DemandServiceTypeOption[];
  stages: DemandWorkflowStageOption[];
  initialFilters: {
    search: string;
    clientId: string;
    companyId: string;
    departmentId: string;
    statusCategory: string;
    assigneeMembershipId: string;
    priority: string;
    view: DemandViewMode;
  };
}

export const STATUS_CATEGORY_LABELS: Record<WorkflowStageCategory, string> = {
  backlog: 'Triagem / Backlog',
  active: 'Em Execução',
  waiting: 'Aguardando',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

export const STATUS_CATEGORY_BADGE: Record<
  WorkflowStageCategory,
  'default' | 'emerald' | 'warning' | 'danger' | 'outline'
> = {
  backlog: 'outline',
  active: 'default',
  waiting: 'warning',
  done: 'emerald',
  cancelled: 'danger',
};

export const PRIORITY_LABELS: Record<DemandPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

export const PRIORITY_BADGE: Record<
  DemandPriority,
  'default' | 'emerald' | 'warning' | 'danger' | 'outline'
> = {
  low: 'outline',
  medium: 'default',
  high: 'warning',
  urgent: 'danger',
};

function formatDateBr(isoDate: string | null): string {
  if (!isoDate) return 'Sem prazo';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function isOverdue(dueDate: string | null, statusCategory: WorkflowStageCategory): boolean {
  if (!dueDate || statusCategory === 'done' || statusCategory === 'cancelled') {
    return false;
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  return dueDate.slice(0, 10) < todayIso;
}

const KANBAN_COLUMNS: WorkflowStageCategory[] = [
  'backlog',
  'active',
  'waiting',
  'done',
  'cancelled',
];

export function DemandsListClient({
  orgSlug,
  canCreateDemand,
  actorDepartmentIds,
  actorRole,
  actorMembershipId,
  demands,
  clients,
  companies,
  departments,
  members,
  serviceTypes,
  stages,
  initialFilters,
}: DemandsListClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Estados de filtro e visualização
  const [search, setSearch] = useState(initialFilters.search);
  const [filterClientId, setFilterClientId] = useState(initialFilters.clientId);
  const [filterCompanyId, setFilterCompanyId] = useState(initialFilters.companyId);
  const [filterDepartmentId, setFilterDepartmentId] = useState(initialFilters.departmentId);
  const [filterStatus, setFilterStatus] = useState(initialFilters.statusCategory);
  const [filterAssigneeId, setFilterAssigneeId] = useState(initialFilters.assigneeMembershipId);
  const [filterPriority, setFilterPriority] = useState(initialFilters.priority);
  const [viewMode, setViewMode] = useState<DemandViewMode>(initialFilters.view);

  // Modal / painel de criação de nova demanda
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const defaultSvc = serviceTypes[0];

  const allowedDepartmentsForCreation = useMemo(() => {
    if (actorRole === 'org_admin' || actorRole === 'manager') {
      return departments;
    }
    return departments.filter((d) => actorDepartmentIds.includes(d.id));
  }, [actorDepartmentIds, actorRole, departments]);

  const initialDepartmentId =
    (defaultSvc?.defaultDepartmentId &&
    allowedDepartmentsForCreation.some((d) => d.id === defaultSvc.defaultDepartmentId)
      ? defaultSvc.defaultDepartmentId
      : allowedDepartmentsForCreation[0]?.id) ?? '';

  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formClientId, setFormClientId] = useState(clients[0]?.id ?? '');
  const [formCompanyId, setFormCompanyId] = useState('');
  const [formServiceTypeId, setFormServiceTypeId] = useState(defaultSvc?.id ?? '');
  const [formStageId, setFormStageId] = useState('');
  const [formDepartmentId, setFormDepartmentId] = useState(initialDepartmentId);
  const [formAssigneeId, setFormAssigneeId] = useState(actorMembershipId);
  const [formPriority, setFormPriority] = useState<DemandPriority>('medium');
  const [formDueDate, setFormDueDate] = useState('');

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    createdDemandId?: string;
    createdDemandCode?: string;
  } | null>(null);

  // Filtra empresas disponíveis pelo cliente selecionado no filtro
  const filterCompanyOptions = useMemo(() => {
    if (!filterClientId) return companies;
    return companies.filter((c) => c.clientId === filterClientId);
  }, [companies, filterClientId]);

  // Filtra empresas disponíveis estritamente pelo cliente selecionado na abertura da demanda (FK Tripla — Decisão A2)
  const formCompanyOptions = useMemo(() => {
    if (!formClientId) return [];
    return companies.filter((c) => c.clientId === formClientId);
  }, [companies, formClientId]);

  // Filtra etapas do workflow do serviço selecionado
  const formStageOptions = useMemo(() => {
    const selectedSvc = serviceTypes.find((s) => s.id === formServiceTypeId);
    if (!selectedSvc) return stages;
    return stages.filter((st) => st.workflowId === selectedSvc.defaultWorkflowId);
  }, [formServiceTypeId, serviceTypes, stages]);

  // Indicadores calculados a partir dos registros reais retornados pelo banco
  const metrics = useMemo(() => {
    const total = demands.length;
    const active = demands.filter((d) => d.statusCategory === 'active').length;
    const waiting = demands.filter((d) => d.statusCategory === 'waiting').length;
    const done = demands.filter((d) => d.statusCategory === 'done').length;
    const overdue = demands.filter((d) => isOverdue(d.dueDate, d.statusCategory)).length;
    return { total, active, waiting, done, overdue };
  }, [demands]);

  function buildUrlParams(overrides?: Partial<typeof initialFilters>) {
    const params = new URLSearchParams();
    const s = overrides?.search !== undefined ? overrides.search : search;
    const cId = overrides?.clientId !== undefined ? overrides.clientId : filterClientId;
    const compId = overrides?.companyId !== undefined ? overrides.companyId : filterCompanyId;
    const deptId =
      overrides?.departmentId !== undefined ? overrides.departmentId : filterDepartmentId;
    const st = overrides?.statusCategory !== undefined ? overrides.statusCategory : filterStatus;
    const assId =
      overrides?.assigneeMembershipId !== undefined
        ? overrides.assigneeMembershipId
        : filterAssigneeId;
    const prio = overrides?.priority !== undefined ? overrides.priority : filterPriority;
    const vw = overrides?.view !== undefined ? overrides.view : viewMode;

    if (s.trim()) params.set('search', s.trim());
    if (cId) params.set('clientId', cId);
    if (compId) params.set('companyId', compId);
    if (deptId) params.set('departmentId', deptId);
    if (st) params.set('status', st);
    if (assId) params.set('assigneeId', assId);
    if (prio) params.set('priority', prio);
    if (vw && vw !== 'table') params.set('view', vw);
    return params.toString();
  }

  function handleApplyFilters(e: React.FormEvent) {
    e.preventDefault();
    const qs = buildUrlParams();
    router.push(`/${orgSlug}/demandas${qs ? `?${qs}` : ''}`);
  }

  function handleClearFilters() {
    setSearch('');
    setFilterClientId('');
    setFilterCompanyId('');
    setFilterDepartmentId('');
    setFilterStatus('');
    setFilterAssigneeId('');
    setFilterPriority('');
    router.push(`/${orgSlug}/demandas${viewMode !== 'table' ? `?view=${viewMode}` : ''}`);
  }

  function handleChangeClientInForm(nextClientId: string) {
    setFormClientId(nextClientId);
    // Limpa a empresa selecionada caso ela não pertença ao novo cliente (garantia de FK tripla)
    setFormCompanyId((prev) => {
      const stillValid = companies.some((c) => c.id === prev && c.clientId === nextClientId);
      return stillValid ? prev : '';
    });
  }

  function handleChangeServiceTypeInForm(nextServiceTypeId: string) {
    setFormServiceTypeId(nextServiceTypeId);
    setFormStageId('');
    const svc = serviceTypes.find((s) => s.id === nextServiceTypeId);
    if (
      svc?.defaultDepartmentId &&
      allowedDepartmentsForCreation.some((d) => d.id === svc.defaultDepartmentId)
    ) {
      setFormDepartmentId(svc.defaultDepartmentId);
    }
  }

  function handleCreateDemandSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const result = await createDemandAction({
        orgSlug,
        title: formTitle,
        description: formDescription || undefined,
        clientId: formClientId,
        companyId: formCompanyId || null,
        serviceTypeId: formServiceTypeId || null,
        stageId: formStageId || null,
        departmentId: formDepartmentId,
        assigneeMembershipId: formAssigneeId || null,
        priority: formPriority,
        dueDate: formDueDate || null,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Demanda ${result.data.code} ("${result.data.title}") registrada com sucesso.`,
        createdDemandId: result.data.id,
        createdDemandCode: result.data.code,
      });
      setFormTitle('');
      setFormDescription('');
      setFormDueDate('');
      setShowCreatePanel(false);
      router.refresh();
    });
  }

  const columns: DataTableColumn<SerializedDemandSummary>[] = [
    {
      key: 'code',
      header: 'Código',
      cell: (row) => (
        <Link
          href={`/${orgSlug}/demandas/${row.id}`}
          className="text-brand-navy hover:text-brand-emerald font-mono text-xs font-semibold underline-offset-2 hover:underline"
        >
          {row.code}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Demanda e Serviço',
      cell: (row) => (
        <div className="space-y-0.5">
          <Link
            href={`/${orgSlug}/demandas/${row.id}`}
            className="hover:text-brand-navy block font-medium text-slate-900 hover:underline"
          >
            {row.title}
          </Link>
          <p className="text-[11px] text-slate-500">
            {row.serviceCategoryName} · {row.serviceTypeName}
          </p>
        </div>
      ),
    },
    {
      key: 'clientCompany',
      header: 'Cliente / Empresa',
      cell: (row) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{row.clientName}</span>
          </div>
          {row.companyLegalName ? (
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Landmark className="h-3 w-3 shrink-0 text-slate-400" />
              <span>{row.companyLegalName}</span>
              {row.companyCnpj ? (
                <span className="font-mono text-[10px] text-slate-400">
                  ({formatCnpj(row.companyCnpj)})
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-[11px] text-slate-400">Sem PJ específica vinculada</span>
          )}
        </div>
      ),
    },
    {
      key: 'departmentAssignee',
      header: 'Departamento / Analista',
      cell: (row) => (
        <div className="space-y-0.5">
          <span className="block text-xs font-medium text-slate-800">{row.departmentName}</span>
          {row.assigneeName ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
              <UserCheck className="h-3 w-3 text-slate-400" />
              {row.assigneeName}
            </span>
          ) : (
            <span className="text-[11px] text-amber-700">Não atribuído</span>
          )}
        </div>
      ),
    },
    {
      key: 'stageStatus',
      header: 'Etapa e Status',
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={STATUS_CATEGORY_BADGE[row.statusCategory]}>{row.stageName}</Badge>
          <span className="text-[10px] text-slate-500">
            {STATUS_CATEGORY_LABELS[row.statusCategory]}
          </span>
        </div>
      ),
    },
    {
      key: 'priorityDue',
      header: 'Prioridade e Prazo',
      cell: (row) => {
        const overdue = isOverdue(row.dueDate, row.statusCategory);
        return (
          <div className="space-y-1">
            <Badge variant={PRIORITY_BADGE[row.priority]}>{PRIORITY_LABELS[row.priority]}</Badge>
            <div
              className={`flex items-center gap-1 text-[11px] ${
                overdue ? 'font-semibold text-red-700' : 'text-slate-600'
              }`}
            >
              <Calendar className="h-3 w-3 shrink-0" />
              <span>{formatDateBr(row.dueDate)}</span>
              {overdue ? <span className="text-[10px] uppercase">(Vencido)</span> : null}
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Ação',
      className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end">
          <Link href={`/${orgSlug}/demandas/${row.id}`}>
            <Button type="button" variant="outline" size="sm">
              Abrir
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  const hasActiveFilters = Boolean(
    search ||
    filterClientId ||
    filterCompanyId ||
    filterDepartmentId ||
    filterStatus ||
    filterAssigneeId ||
    filterPriority,
  );

  return (
    <div className="space-y-6">
      {/* Indicadores Operacionais Reais (CLAUDE.md §3.2) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Demandas no Escopo</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{metrics.total}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Ordens de serviço listadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Em Execução</p>
            <p className="text-brand-navy mt-1 text-2xl font-semibold">{metrics.active}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Etapas ativas do workflow</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Aguardando</p>
            <p className="mt-1 text-2xl font-semibold text-amber-700">{metrics.waiting}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Pendentes de cliente ou órgão</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Prazo Vencido</p>
            <p className="mt-1 text-2xl font-semibold text-red-700">{metrics.overdue}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Exigem priorização imediata</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Concluídas</p>
            <p className="text-brand-emerald mt-1 text-2xl font-semibold">{metrics.done}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Finalizadas e auditadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Feedback de operação */}
      {feedback ? (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{feedback.message}</span>
          </div>

          <div className="flex items-center gap-2">
            {feedback.createdDemandId ? (
              <Link
                href={`/${orgSlug}/demandas/${feedback.createdDemandId}`}
                className="inline-flex items-center gap-1 rounded-xs bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
              >
                Ver {feedback.createdDemandCode}
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs underline opacity-80 hover:opacity-100"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {/* Barra de Filtros Combináveis + Alternador de Visão + Abertura de Demanda */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
                Filtros Operacionais Combináveis
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Seletor de modo de visualização */}
              <div
                className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5"
                role="group"
                aria-label="Modo de visualização de demandas"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'table'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  Tabela
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  Lista
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'kanban'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  Kanban
                </button>
              </div>

              {canCreateDemand ? (
                <Button
                  type="button"
                  variant={showCreatePanel ? 'outline' : 'default'}
                  onClick={() => setShowCreatePanel((prev) => !prev)}
                >
                  {showCreatePanel ? (
                    <>
                      <X className="h-4 w-4" />
                      Fechar formulário
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Nova Demanda
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          <form onSubmit={handleApplyFilters} className="space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative sm:col-span-2">
                <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código (DEM-0001), título, cliente ou razão social..."
                  className="pl-9"
                  aria-label="Buscar demandas"
                />
              </div>

              <select
                value={filterClientId}
                onChange={(e) => {
                  const nextClient = e.target.value;
                  setFilterClientId(nextClient);
                  if (
                    nextClient &&
                    filterCompanyId &&
                    !companies.some((c) => c.id === filterCompanyId && c.clientId === nextClient)
                  ) {
                    setFilterCompanyId('');
                  }
                }}
                aria-label="Filtrar por cliente"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todos os clientes</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name}
                  </option>
                ))}
              </select>

              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                aria-label="Filtrar por empresa"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todas as empresas (PJ)</option>
                {filterCompanyOptions.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.legalName} ({formatCnpj(comp.cnpj)})
                  </option>
                ))}
              </select>

              <select
                value={filterDepartmentId}
                onChange={(e) => setFilterDepartmentId(e.target.value)}
                aria-label="Filtrar por departamento"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todos os departamentos</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filtrar por categoria de status"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todos os status</option>
                <option value="backlog">Triagem / Backlog</option>
                <option value="active">Em Execução</option>
                <option value="waiting">Aguardando</option>
                <option value="done">Concluída</option>
                <option value="cancelled">Cancelada</option>
              </select>

              <select
                value={filterAssigneeId}
                onChange={(e) => setFilterAssigneeId(e.target.value)}
                aria-label="Filtrar por analista atribuído"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todos os analistas</option>
                {members.map((m) => (
                  <option key={m.membershipId} value={m.membershipId}>
                    {m.name}
                  </option>
                ))}
              </select>

              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                aria-label="Filtrar por prioridade"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todas as prioridades</option>
                <option value="urgent">Urgente</option>
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2">
              {hasActiveFilters ? (
                <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
                  Limpar filtros
                </Button>
              ) : null}
              <Button type="submit" variant="outline" size="sm">
                Aplicar filtros
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Modal / Painel de Abertura de Nova Demanda */}
      {showCreatePanel && canCreateDemand ? (
        <Card className="border-brand-navy/30 shadow-xs">
          <CardHeader>
            <CardTitle>Abertura de Nova Demanda (Ordem de Serviço)</CardTitle>
            <CardDescription>
              A demanda receberá numeração sequencial única da organização (ex.: DEM-0001) e terá
              seu histórico inicial de etapa e auditoria registrados automaticamente. A seleção de
              empresa é validada pela chave estrangeira tripla (Organização + Cliente + Empresa).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clients.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                Para abrir uma demanda, cadastre primeiro ao menos um cliente ativo em{' '}
                <Link href={`/${orgSlug}/clientes`} className="font-semibold underline">
                  Clientes
                </Link>
                .
              </div>
            ) : allowedDepartmentsForCreation.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                Nenhum departamento ativo disponível no seu escopo para abertura de demandas.
              </div>
            ) : (
              <form onSubmit={handleCreateDemandSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2">
                    <FormField
                      label="Título da Demanda / Ordem de Serviço"
                      id="demand-title"
                      required
                    >
                      <Input
                        id="demand-title"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        placeholder="Ex.: Constituição de SPE e Registro na Junta Comercial"
                        required
                      />
                    </FormField>
                  </div>

                  <FormField label="Tipo de Serviço e Workflow" id="demand-service-type" required>
                    <select
                      id="demand-service-type"
                      value={formServiceTypeId}
                      onChange={(e) => handleChangeServiceTypeInForm(e.target.value)}
                      className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                      required
                    >
                      {serviceTypes.map((svc) => (
                        <option key={svc.id} value={svc.id}>
                          {svc.categoryName} · {svc.name}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Cliente Contratante" id="demand-client" required>
                    <select
                      id="demand-client"
                      value={formClientId}
                      onChange={(e) => handleChangeClientInForm(e.target.value)}
                      className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                      required
                    >
                      <option value="" disabled>
                        Selecione o cliente...
                      </option>
                      {clients.map((cl) => (
                        <option key={cl.id} value={cl.id}>
                          {cl.name}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField
                    label="Empresa Objeto da Demanda (FK Tripla)"
                    id="demand-company"
                    hint="Exibe exclusivamente pessoas jurídicas vinculadas ao cliente selecionado."
                  >
                    <select
                      id="demand-company"
                      value={formCompanyId}
                      onChange={(e) => setFormCompanyId(e.target.value)}
                      className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                    >
                      <option value="">Sem pessoa jurídica específica (demanda geral)</option>
                      {formCompanyOptions.map((comp) => (
                        <option key={comp.id} value={comp.id}>
                          {comp.legalName} ({formatCnpj(comp.cnpj)})
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Departamento Responsável" id="demand-department" required>
                    <select
                      id="demand-department"
                      value={formDepartmentId}
                      onChange={(e) => setFormDepartmentId(e.target.value)}
                      className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                      required
                    >
                      {allowedDepartmentsForCreation.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Analista / Responsável Atribuído" id="demand-assignee">
                    <select
                      id="demand-assignee"
                      value={formAssigneeId}
                      onChange={(e) => setFormAssigneeId(e.target.value)}
                      className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                    >
                      <option value="">Não atribuído (fila do departamento)</option>
                      {members.map((m) => (
                        <option key={m.membershipId} value={m.membershipId}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Etapa Inicial do Workflow" id="demand-stage">
                    <select
                      id="demand-stage"
                      value={formStageId}
                      onChange={(e) => setFormStageId(e.target.value)}
                      className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                    >
                      <option value="">Primeira etapa padrão do workflow</option>
                      {formStageOptions.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.position}. {st.name} ({STATUS_CATEGORY_LABELS[st.category]})
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Prioridade" id="demand-priority" required>
                    <select
                      id="demand-priority"
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value as DemandPriority)}
                      className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                    >
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </FormField>

                  <FormField
                    label="Prazo Fatal (Due Date)"
                    id="demand-due-date"
                    hint="Data limite geral para conclusão da ordem de serviço (Decisão A7)."
                  >
                    <Input
                      id="demand-due-date"
                      type="date"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                    />
                  </FormField>

                  <div className="sm:col-span-2">
                    <FormField label="Escopo e Instruções Operacionais" id="demand-description">
                      <textarea
                        id="demand-description"
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        rows={2}
                        placeholder="Descreva os atos societários, órgãos envolvidos, exigências ou documentos necessários..."
                        className="focus-visible:ring-brand-navy w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                      />
                    </FormField>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCreatePanel(false)}
                    disabled={isPending}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" variant="default" disabled={isPending}>
                    {isPending ? 'Registrando demanda...' : 'Registrar Demanda'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Visualização 1: Tabela (DataTable) */}
      {viewMode === 'table' ? (
        <section aria-labelledby="demands-table-heading" className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2
              id="demands-table-heading"
              className="text-xs font-semibold tracking-wider text-slate-600 uppercase"
            >
              Ordens de Serviço e Demandas
            </h2>
            <span className="font-mono text-[11px] text-slate-500">
              {demands.length} {demands.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          <DataTable
            columns={columns}
            data={demands}
            getRowKey={(row) => row.id}
            emptyMessage="Nenhuma demanda encontrada com os critérios e escopo selecionados."
          />
        </section>
      ) : null}

      {/* Visualização 2: Lista Compacta */}
      {viewMode === 'list' ? (
        <section aria-labelledby="demands-list-heading" className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2
              id="demands-list-heading"
              className="text-xs font-semibold tracking-wider text-slate-600 uppercase"
            >
              Lista Operacional Compacta
            </h2>
            <span className="font-mono text-[11px] text-slate-500">
              {demands.length} {demands.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          {demands.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-xs text-slate-500">
                Nenhuma demanda encontrada com os critérios e escopo selecionados.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {demands.map((d) => {
                const overdue = isOverdue(d.dueDate, d.statusCategory);
                return (
                  <Link
                    key={d.id}
                    href={`/${orgSlug}/demandas/${d.id}`}
                    className="hover:border-brand-navy/40 flex flex-col justify-between gap-3 rounded-md border border-slate-200 bg-white p-3.5 transition-colors sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-brand-navy font-mono text-xs font-semibold">
                          {d.code}
                        </span>
                        <Badge variant={STATUS_CATEGORY_BADGE[d.statusCategory]}>
                          {d.stageName}
                        </Badge>
                        <Badge variant={PRIORITY_BADGE[d.priority]}>
                          {PRIORITY_LABELS[d.priority]}
                        </Badge>
                        <span className="text-[11px] text-slate-500">{d.departmentName}</span>
                      </div>
                      <p className="truncate text-sm font-medium text-slate-900">{d.title}</p>
                      <p className="text-xs text-slate-600">
                        Cliente: <span className="font-medium">{d.clientName}</span>
                        {d.companyLegalName ? ` · Empresa: ${d.companyLegalName}` : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-4 text-xs">
                      <div className="text-right">
                        <p className="text-[11px] text-slate-500">
                          {d.assigneeName ?? 'Não atribuído'}
                        </p>
                        <p
                          className={`font-mono text-[11px] ${
                            overdue ? 'font-semibold text-red-700' : 'text-slate-600'
                          }`}
                        >
                          Prazo: {formatDateBr(d.dueDate)}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {/* Visualização 3: Quadro Kanban por Status Derivado (Decisão A6) */}
      {viewMode === 'kanban' ? (
        <section aria-labelledby="demands-kanban-heading" className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2
              id="demands-kanban-heading"
              className="text-xs font-semibold tracking-wider text-slate-600 uppercase"
            >
              Quadro Kanban por Categoria de Etapa (Decisão A6)
            </h2>
            <span className="font-mono text-[11px] text-slate-500">
              {demands.length} {demands.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
            {KANBAN_COLUMNS.map((cat) => {
              const items = demands.filter((d) => d.statusCategory === cat);
              return (
                <div
                  key={cat}
                  className="flex flex-col rounded-md border border-slate-200 bg-slate-100/70 p-2.5"
                >
                  <div className="mb-2.5 flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-slate-800">
                      {STATUS_CATEGORY_LABELS[cat]}
                    </span>
                    <Badge variant={STATUS_CATEGORY_BADGE[cat]}>{items.length}</Badge>
                  </div>

                  <div className="flex-1 space-y-2">
                    {items.length === 0 ? (
                      <div className="rounded-xs border border-dashed border-slate-200 bg-white/50 p-4 text-center text-[11px] text-slate-400">
                        Sem demandas
                      </div>
                    ) : (
                      items.map((d) => {
                        const overdue = isOverdue(d.dueDate, d.statusCategory);
                        return (
                          <Link
                            key={d.id}
                            href={`/${orgSlug}/demandas/${d.id}`}
                            className="hover:border-brand-navy/40 block space-y-2 rounded-md border border-slate-200 bg-white p-3 shadow-2xs transition-colors"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-brand-navy font-mono text-[11px] font-semibold">
                                {d.code}
                              </span>
                              <Badge variant={PRIORITY_BADGE[d.priority]}>
                                {PRIORITY_LABELS[d.priority]}
                              </Badge>
                            </div>
                            <p className="line-clamp-2 text-xs font-medium text-slate-900">
                              {d.title}
                            </p>
                            <div className="space-y-0.5 text-[11px] text-slate-600">
                              <p className="truncate font-medium">{d.clientName}</p>
                              {d.companyLegalName ? (
                                <p className="truncate text-[10px] text-slate-500">
                                  {d.companyLegalName}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                              <span className="truncate">{d.stageName}</span>
                              <span
                                className={
                                  overdue ? 'font-semibold text-red-700' : 'text-slate-500'
                                }
                              >
                                {formatDateBr(d.dueDate)}
                              </span>
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

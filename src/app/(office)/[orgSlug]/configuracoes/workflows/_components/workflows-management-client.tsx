'use client';

import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Edit3,
  GitBranch,
  Lock,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { FormField } from '@/components/shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { WorkflowStageCategory } from '@/server/modules/demands/service';
import {
  archiveWorkflowStageAction,
  createServiceTypeAction,
  createWorkflowAction,
  createWorkflowStageAction,
  reorderWorkflowStagesAction,
  setWorkflowTransitionRulesAction,
  updateServiceTypeWorkflowAction,
  updateWorkflowAction,
  updateWorkflowStageAction,
} from '@/server/modules/workflows/actions';
import type {
  ServiceCategoryDTO,
  ServiceTypeWithWorkflowDTO,
  WorkflowStageDTO,
  WorkflowTransitionRuleDTO,
} from '@/server/modules/workflows/service';
import {
  STATUS_CATEGORY_BADGE,
  STATUS_CATEGORY_LABELS,
} from '../../../demandas/_components/demands-list-client';

export interface SerializedWorkflowDTO {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  stages: WorkflowStageDTO[];
  transitions: WorkflowTransitionRuleDTO[];
  demandsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDepartmentOption {
  id: string;
  name: string;
}

interface WorkflowsManagementClientProps {
  orgSlug: string;
  canWrite: boolean;
  workflows: SerializedWorkflowDTO[];
  serviceCategories: ServiceCategoryDTO[];
  serviceTypes: ServiceTypeWithWorkflowDTO[];
  departments: WorkflowDepartmentOption[];
}

interface DraftStageItem {
  name: string;
  category: WorkflowStageCategory;
}

const DEFAULT_DRAFT_STAGES: DraftStageItem[] = [
  { name: 'Triagem e Recebimento', category: 'backlog' },
  { name: 'Em Execução Técnica', category: 'active' },
  { name: 'Aguardando Órgão / Cliente', category: 'waiting' },
  { name: 'Concluída', category: 'done' },
];

export function WorkflowsManagementClient({
  orgSlug,
  canWrite,
  workflows,
  serviceCategories,
  serviceTypes,
  departments,
}: WorkflowsManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Estado para criação de novo Workflow
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false);
  const [newWfName, setNewWfName] = useState('');
  const [newWfDescription, setNewWfDescription] = useState('');
  const [newWfIsDefault, setNewWfIsDefault] = useState(false);
  const [draftStages, setDraftStages] = useState<DraftStageItem[]>(DEFAULT_DRAFT_STAGES);

  // Estado para edição de cabeçalho de um Workflow existente
  const [editingWfId, setEditingWfId] = useState<string | null>(null);
  const [editWfName, setEditWfName] = useState('');
  const [editWfDescription, setEditWfDescription] = useState('');
  const [editWfIsDefault, setEditWfIsDefault] = useState(false);

  // Estado para adição de etapa em um Workflow existente
  const [addingStageWfId, setAddingStageWfId] = useState<string | null>(null);
  const [newStageName, setNewStageName] = useState('');
  const [newStageCategory, setNewStageCategory] = useState<WorkflowStageCategory>('active');
  const [newStageAsInitial, setNewStageAsInitial] = useState(false);

  // Estado para edição de uma etapa existente
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editStageName, setEditStageName] = useState('');
  const [editStageCategory, setEditStageCategory] = useState<WorkflowStageCategory>('active');

  // Estado para arquivamento de etapa com etapa substituta (quando há demandas vinculadas)
  const [archivingStageId, setArchivingStageId] = useState<string | null>(null);
  const [fallbackStageId, setFallbackStageId] = useState<string>('');

  // Estado para configuração de regras e bloqueios de transição por Workflow
  const [configuringTransitionsWfId, setConfiguringTransitionsWfId] = useState<string | null>(null);
  const [selectedTransitionPairs, setSelectedTransitionPairs] = useState<Set<string>>(new Set());

  // Estado para criação de novo Tipo de Serviço vinculado a um Workflow
  const [showCreateServiceType, setShowCreateServiceType] = useState(false);
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcCategoryId, setNewSvcCategoryId] = useState(serviceCategories[0]?.id ?? '');
  const [newSvcNewCategoryName, setNewSvcNewCategoryName] = useState('');
  const [newSvcWorkflowId, setNewSvcWorkflowId] = useState(workflows[0]?.id ?? '');
  const [newSvcDepartmentId, setNewSvcDepartmentId] = useState(departments[0]?.id ?? '');
  const [newSvcDueDays, setNewSvcDueDays] = useState('15');

  const metrics = useMemo(() => {
    const totalWorkflows = workflows.length;
    const totalStages = workflows.reduce((acc, wf) => acc + wf.stages.length, 0);
    const totalServiceTypes = serviceTypes.length;
    const totalDemands = workflows.reduce((acc, wf) => acc + wf.demandsCount, 0);
    return { totalWorkflows, totalStages, totalServiceTypes, totalDemands };
  }, [serviceTypes.length, workflows]);

  function handleAddDraftStage() {
    setDraftStages((prev) => [...prev, { name: '', category: 'active' }]);
  }

  function handleRemoveDraftStage(idx: number) {
    setDraftStages((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function handleCreateWorkflowSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const result = await createWorkflowAction({
        orgSlug,
        name: newWfName,
        description: newWfDescription || null,
        isDefault: newWfIsDefault,
        stages: draftStages.map((s) => ({
          name: s.name,
          category: s.category,
          clientVisible: true,
        })),
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Esteira "${result.data.name}" criada com ${result.data.stagesCount} etapa(s).`,
      });
      setNewWfName('');
      setNewWfDescription('');
      setNewWfIsDefault(false);
      setDraftStages(DEFAULT_DRAFT_STAGES);
      setShowCreateWorkflow(false);
      router.refresh();
    });
  }

  function startEditWorkflow(wf: SerializedWorkflowDTO) {
    setEditingWfId(wf.id);
    setEditWfName(wf.name);
    setEditWfDescription(wf.description ?? '');
    setEditWfIsDefault(wf.isDefault);
  }

  function handleUpdateWorkflowSubmit(e: React.FormEvent, workflowId: string) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const result = await updateWorkflowAction({
        orgSlug,
        workflowId,
        name: editWfName,
        description: editWfDescription || null,
        isDefault: editWfIsDefault,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Esteira "${result.data.name}" atualizada com sucesso.`,
      });
      setEditingWfId(null);
      router.refresh();
    });
  }

  function handleCreateStageSubmit(e: React.FormEvent, workflowId: string) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const result = await createWorkflowStageAction({
        orgSlug,
        workflowId,
        name: newStageName,
        category: newStageCategory,
        asInitialStage: newStageAsInitial,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Etapa "${result.data.name}" adicionada na posição ${result.data.position}.`,
      });
      setNewStageName('');
      setNewStageAsInitial(false);
      setAddingStageWfId(null);
      router.refresh();
    });
  }

  function startEditStage(stage: WorkflowStageDTO) {
    setEditingStageId(stage.id);
    setEditStageName(stage.name);
    setEditStageCategory(stage.category);
  }

  function handleUpdateStageSubmit(e: React.FormEvent, stageId: string) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const result = await updateWorkflowStageAction({
        orgSlug,
        stageId,
        name: editStageName,
        category: editStageCategory,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Etapa "${result.data.name}" atualizada.`,
      });
      setEditingStageId(null);
      router.refresh();
    });
  }

  function handleMoveStage(wf: SerializedWorkflowDTO, index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= wf.stages.length) return;

    const ordered = wf.stages.map((s) => s.id);
    const temp = ordered[index]!;
    ordered[index] = ordered[targetIndex]!;
    ordered[targetIndex] = temp;

    setFeedback(null);
    startTransition(async () => {
      const result = await reorderWorkflowStagesAction({
        orgSlug,
        workflowId: wf.id,
        orderedStageIds: ordered,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: 'Ordem das etapas e etapa inicial atualizadas.',
      });
      router.refresh();
    });
  }

  function handleMakeInitialStage(wf: SerializedWorkflowDTO, stageId: string) {
    const rest = wf.stages.filter((s) => s.id !== stageId).map((s) => s.id);
    const ordered = [stageId, ...rest];

    setFeedback(null);
    startTransition(async () => {
      const result = await reorderWorkflowStagesAction({
        orgSlug,
        workflowId: wf.id,
        orderedStageIds: ordered,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: 'Etapa definida como Etapa Inicial (Posição 1) da esteira.',
      });
      router.refresh();
    });
  }

  function handleArchiveStage(stage: WorkflowStageDTO, wf: SerializedWorkflowDTO) {
    if (stage.demandsCount > 0 && archivingStageId !== stage.id) {
      const firstOther = wf.stages.find((s) => s.id !== stage.id);
      setArchivingStageId(stage.id);
      setFallbackStageId(firstOther?.id ?? '');
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await archiveWorkflowStageAction({
        orgSlug,
        stageId: stage.id,
        fallbackStageId: archivingStageId === stage.id ? fallbackStageId || null : null,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setArchivingStageId(null);
      setFeedback({
        type: 'success',
        message:
          result.data.migratedDemandsCount > 0
            ? `Etapa arquivada e ${result.data.migratedDemandsCount} demanda(s) migrada(s) para a etapa substituta.`
            : 'Etapa arquivada com sucesso.',
      });
      router.refresh();
    });
  }

  function openTransitionConfigurator(wf: SerializedWorkflowDTO) {
    if (configuringTransitionsWfId === wf.id) {
      setConfiguringTransitionsWfId(null);
      return;
    }
    const currentSet = new Set(wf.transitions.map((t) => `${t.fromStageId}->${t.toStageId}`));
    setSelectedTransitionPairs(currentSet);
    setConfiguringTransitionsWfId(wf.id);
  }

  function toggleTransitionPair(fromId: string, toId: string) {
    const key = `${fromId}->${toId}`;
    setSelectedTransitionPairs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function applySequentialTransitionsPreset(wf: SerializedWorkflowDTO) {
    const next = new Set<string>();
    for (let i = 0; i < wf.stages.length - 1; i++) {
      next.add(`${wf.stages[i]!.id}->${wf.stages[i + 1]!.id}`);
    }
    setSelectedTransitionPairs(next);
  }

  function handleSaveTransitionRules(wfId: string, clearAll = false) {
    const transitions = clearAll
      ? []
      : Array.from(selectedTransitionPairs).map((pair) => {
          const [fromStageId, toStageId] = pair.split('->');
          return { fromStageId: fromStageId!, toStageId: toStageId! };
        });

    setFeedback(null);
    startTransition(async () => {
      const result = await setWorkflowTransitionRulesAction({
        orgSlug,
        workflowId: wfId,
        transitions,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message:
          result.data.rulesCount === 0
            ? 'Esteira configurada para transição livre entre todas as suas etapas ativas.'
            : `${result.data.rulesCount} regra(s) estrita(s) de transição salva(s) para a esteira.`,
      });
      setConfiguringTransitionsWfId(null);
      router.refresh();
    });
  }

  function handleServiceTypeWorkflowChange(serviceTypeId: string, defaultWorkflowId: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateServiceTypeWorkflowAction({
        orgSlug,
        serviceTypeId,
        defaultWorkflowId,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: 'Esteira padrão do tipo de serviço atualizada com sucesso.',
      });
      router.refresh();
    });
  }

  function handleCreateServiceTypeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const dueDaysNum = Number.parseInt(newSvcDueDays, 10);
      const result = await createServiceTypeAction({
        orgSlug,
        categoryId: newSvcCategoryId === '__new__' ? null : newSvcCategoryId || null,
        newCategoryName: newSvcCategoryId === '__new__' ? newSvcNewCategoryName : null,
        name: newSvcName,
        defaultWorkflowId: newSvcWorkflowId,
        defaultDepartmentId: newSvcDepartmentId || null,
        defaultDueDays: Number.isNaN(dueDaysNum) ? null : dueDaysNum,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Tipo de serviço "${result.data.name}" cadastrado e vinculado à esteira.`,
      });
      setNewSvcName('');
      setNewSvcNewCategoryName('');
      setShowCreateServiceType(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Indicadores reais do catálogo */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Esteiras Ativas</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{metrics.totalWorkflows}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Workflows operacionais da organização
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Etapas Configuradas</p>
            <p className="text-brand-navy mt-1 text-2xl font-semibold">{metrics.totalStages}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Mapeadas às 5 categorias canônicas (Decisão A6)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Tipos de Serviço</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {metrics.totalServiceTypes}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Associados a esteiras padrão</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Demandas Vinculadas</p>
            <p className="text-brand-emerald mt-1 text-2xl font-semibold">{metrics.totalDemands}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Ordens de serviço em tramitação</p>
          </CardContent>
        </Card>
      </div>

      {/* Feedback de operação */}
      {feedback ? (
        <div
          role="status"
          className={`flex items-center justify-between gap-2 rounded-md border px-4 py-3 text-xs font-medium ${
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
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline opacity-80 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      ) : null}

      {/* Barra de ações superiores */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
            Esteiras de Atendimento Personalizadas ({workflows.length})
          </h2>
          <p className="text-xs text-slate-500">
            Configure etapas, ordenação (onde a Etapa 1 é a etapa inicial) e regras/bloqueios de
            transição.
          </p>
        </div>

        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateServiceType((prev) => !prev)}
            >
              <Plus className="h-4 w-4" />
              {showCreateServiceType ? 'Fechar Tipo de Serviço' : 'Novo Tipo de Serviço'}
            </Button>
            <Button
              type="button"
              variant={showCreateWorkflow ? 'outline' : 'default'}
              onClick={() => setShowCreateWorkflow((prev) => !prev)}
            >
              {showCreateWorkflow ? (
                <>
                  <X className="h-4 w-4" />
                  Fechar Nova Esteira
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Nova Esteira (Workflow)
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Formulário de Criação de Novo Workflow */}
      {showCreateWorkflow && canWrite ? (
        <Card className="border-brand-navy/30">
          <CardHeader>
            <CardTitle>Criar Nova Esteira de Atendimento (Workflow)</CardTitle>
            <CardDescription>
              Defina o nome da esteira e suas etapas ordenadas. A primeira etapa da lista (Posição
              1) será automaticamente a Etapa Inicial atribuída às novas demandas deste fluxo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateWorkflowSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Nome da Esteira / Workflow" id="new-wf-name" required>
                  <Input
                    id="new-wf-name"
                    value={newWfName}
                    onChange={(e) => setNewWfName(e.target.value)}
                    placeholder="Ex.: Esteira de Licenciamento Ambiental e Alvarás"
                    required
                  />
                </FormField>

                <FormField label="Descrição Operacional" id="new-wf-desc">
                  <Input
                    id="new-wf-desc"
                    value={newWfDescription}
                    onChange={(e) => setNewWfDescription(e.target.value)}
                    placeholder="Ex.: Fluxo para obtenção e renovação de alvarás municipais e AVCB"
                  />
                </FormField>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={newWfIsDefault}
                  onChange={(e) => setNewWfIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded-xs border-slate-300"
                />
                Definir como esteira padrão da organização
              </label>

              <div className="space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Etapas Iniciais da Esteira (Mapeamento Canônico — Decisão A6)
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddDraftStage}>
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar Etapa
                  </Button>
                </div>

                <div className="space-y-2">
                  {draftStages.map((st, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-2.5 sm:flex-row sm:items-center"
                    >
                      <span className="w-24 shrink-0 font-mono text-[11px] font-semibold text-slate-500">
                        {idx === 0 ? '1. INICIAL' : `${idx + 1}. Etapa`}
                      </span>
                      <Input
                        value={st.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftStages((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, name: val } : item)),
                          );
                        }}
                        placeholder="Nome da etapa..."
                        className="flex-1"
                        required
                      />
                      <select
                        value={st.category}
                        onChange={(e) => {
                          const cat = e.target.value as WorkflowStageCategory;
                          setDraftStages((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, category: cat } : item)),
                          );
                        }}
                        aria-label={`Categoria da etapa ${idx + 1}`}
                        className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900"
                      >
                        <option value="backlog">Triagem / Backlog (backlog)</option>
                        <option value="active">Em Execução (active)</option>
                        <option value="waiting">Aguardando (waiting)</option>
                        <option value="done">Concluída (done)</option>
                        <option value="cancelled">Cancelada (cancelled)</option>
                      </select>
                      {draftStages.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftStage(idx)}
                          className="rounded-xs p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Remover etapa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCreateWorkflow(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="default" disabled={isPending}>
                  {isPending ? 'Criando esteira...' : 'Salvar Nova Esteira'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Formulário de Criação de Novo Tipo de Serviço */}
      {showCreateServiceType && canWrite ? (
        <Card className="border-brand-navy/30">
          <CardHeader>
            <CardTitle>Cadastrar Novo Tipo de Serviço</CardTitle>
            <CardDescription>
              Associe um tipo de serviço a uma categoria, departamento padrão e esteira de
              atendimento (`default_workflow_id`).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateServiceTypeSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Nome do Serviço" id="new-svc-name" required>
                  <Input
                    id="new-svc-name"
                    value={newSvcName}
                    onChange={(e) => setNewSvcName(e.target.value)}
                    placeholder="Ex.: Obtenção de Alvará de Funcionamento"
                    required
                  />
                </FormField>

                <FormField label="Categoria de Serviço" id="new-svc-cat" required>
                  <select
                    id="new-svc-cat"
                    value={newSvcCategoryId}
                    onChange={(e) => setNewSvcCategoryId(e.target.value)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900"
                  >
                    {serviceCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value="__new__">+ Criar nova categoria...</option>
                  </select>
                </FormField>

                {newSvcCategoryId === '__new__' ? (
                  <FormField label="Nome da Nova Categoria" id="new-svc-new-cat" required>
                    <Input
                      id="new-svc-new-cat"
                      value={newSvcNewCategoryName}
                      onChange={(e) => setNewSvcNewCategoryName(e.target.value)}
                      placeholder="Ex.: Licenciamento e Regulatório"
                      required
                    />
                  </FormField>
                ) : null}

                <FormField label="Esteira Padrão (Workflow)" id="new-svc-wf" required>
                  <select
                    id="new-svc-wf"
                    value={newSvcWorkflowId}
                    onChange={(e) => setNewSvcWorkflowId(e.target.value)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900"
                    required
                  >
                    {workflows.map((wf) => (
                      <option key={wf.id} value={wf.id}>
                        {wf.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Departamento Padrão" id="new-svc-dept">
                  <select
                    id="new-svc-dept"
                    value={newSvcDepartmentId}
                    onChange={(e) => setNewSvcDepartmentId(e.target.value)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900"
                  >
                    <option value="">Sem departamento padrão fixo</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Prazo Padrão Sugerido (dias)" id="new-svc-days">
                  <Input
                    id="new-svc-days"
                    type="number"
                    min={1}
                    max={365}
                    value={newSvcDueDays}
                    onChange={(e) => setNewSvcDueDays(e.target.value)}
                  />
                </FormField>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCreateServiceType(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="default" disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Salvar Tipo de Serviço'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Listagem de Esteiras (Workflows) e Suas Etapas */}
      <div className="space-y-4">
        {workflows.map((wf) => {
          const isEditingThisWf = editingWfId === wf.id;
          const isAddingStageToThisWf = addingStageWfId === wf.id;
          const isConfiguringTransitions = configuringTransitionsWfId === wf.id;
          const hasStrictTransitions = wf.transitions.length > 0;

          return (
            <Card key={wf.id}>
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <GitBranch className="text-brand-navy h-4 w-4" />
                      <CardTitle className="text-base">{wf.name}</CardTitle>
                      {wf.isDefault ? (
                        <Badge variant="emerald">
                          <Star className="mr-1 h-3 w-3" />
                          Workflow Padrão
                        </Badge>
                      ) : null}
                      <Badge variant="outline">{wf.stages.length} etapas</Badge>
                      <Badge variant="default">{wf.demandsCount} demanda(s)</Badge>
                      <Badge variant={hasStrictTransitions ? 'warning' : 'outline'}>
                        {hasStrictTransitions ? (
                          <>
                            <Lock className="mr-1 h-3 w-3" />
                            {wf.transitions.length} regra(s) de transição
                          </>
                        ) : (
                          <>
                            <Unlock className="mr-1 h-3 w-3" />
                            Transição Livre
                          </>
                        )}
                      </Badge>
                    </div>
                    {wf.description ? <CardDescription>{wf.description}</CardDescription> : null}
                  </div>

                  {canWrite ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openTransitionConfigurator(wf)}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {isConfiguringTransitions ? 'Fechar Regras' : 'Regras de Transição'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setAddingStageWfId((prev) => (prev === wf.id ? null : wf.id))
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Nova Etapa
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          isEditingThisWf ? setEditingWfId(null) : startEditWorkflow(wf)
                        }
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        {isEditingThisWf ? 'Cancelar' : 'Editar'}
                      </Button>
                    </div>
                  ) : null}
                </div>

                {/* Edição do cabeçalho do Workflow */}
                {isEditingThisWf && canWrite ? (
                  <form
                    onSubmit={(e) => handleUpdateWorkflowSubmit(e, wf.id)}
                    className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3.5"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField label="Nome da Esteira" id={`edit-wf-name-${wf.id}`} required>
                        <Input
                          id={`edit-wf-name-${wf.id}`}
                          value={editWfName}
                          onChange={(e) => setEditWfName(e.target.value)}
                          required
                        />
                      </FormField>
                      <FormField label="Descrição" id={`edit-wf-desc-${wf.id}`}>
                        <Input
                          id={`edit-wf-desc-${wf.id}`}
                          value={editWfDescription}
                          onChange={(e) => setEditWfDescription(e.target.value)}
                        />
                      </FormField>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={editWfIsDefault}
                          onChange={(e) => setEditWfIsDefault(e.target.checked)}
                          className="h-4 w-4 rounded-xs border-slate-300"
                        />
                        Definir como workflow padrão da organização
                      </label>
                      <Button type="submit" variant="default" size="sm" disabled={isPending}>
                        Salvar Alterações
                      </Button>
                    </div>
                  </form>
                ) : null}
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                {/* Formulário para Adicionar Nova Etapa */}
                {isAddingStageToThisWf && canWrite ? (
                  <form
                    onSubmit={(e) => handleCreateStageSubmit(e, wf.id)}
                    className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3.5"
                  >
                    <p className="text-xs font-semibold text-slate-900">
                      Adicionar Nova Etapa à Esteira &ldquo;{wf.name}&rdquo;
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <FormField label="Nome da Etapa" id={`add-stage-name-${wf.id}`} required>
                        <Input
                          id={`add-stage-name-${wf.id}`}
                          value={newStageName}
                          onChange={(e) => setNewStageName(e.target.value)}
                          placeholder="Ex.: Exigência Junta Comercial"
                          required
                        />
                      </FormField>

                      <FormField
                        label="Categoria Canônica (Decisão A6)"
                        id={`add-stage-cat-${wf.id}`}
                        required
                      >
                        <select
                          id={`add-stage-cat-${wf.id}`}
                          value={newStageCategory}
                          onChange={(e) =>
                            setNewStageCategory(e.target.value as WorkflowStageCategory)
                          }
                          className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900"
                        >
                          <option value="backlog">Triagem / Backlog (backlog)</option>
                          <option value="active">Em Execução (active)</option>
                          <option value="waiting">Aguardando (waiting)</option>
                          <option value="done">Concluída (done)</option>
                          <option value="cancelled">Cancelada (cancelled)</option>
                        </select>
                      </FormField>

                      <div className="flex flex-col justify-end">
                        <label className="flex h-9 items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={newStageAsInitial}
                            onChange={(e) => setNewStageAsInitial(e.target.checked)}
                            className="h-4 w-4 rounded-xs border-slate-300"
                          />
                          Inserir como Etapa Inicial (Posição 1)
                        </label>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAddingStageWfId(null)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" variant="default" size="sm" disabled={isPending}>
                        Inserir Etapa
                      </Button>
                    </div>
                  </form>
                ) : null}

                {/* Configurador de Regras e Bloqueios de Transição */}
                {isConfiguringTransitions && canWrite ? (
                  <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-4">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          Matriz de Regras e Bloqueios de Transição ({wf.name})
                        </p>
                        <p className="text-[11px] text-slate-600">
                          Selecione os avanços/retornos permitidos entre etapas. Se nenhuma caixa
                          for mantida ou ao clicar em &ldquo;Modo Livre&rdquo;, qualquer etapa ativa
                          poderá transicionar para outra.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => applySequentialTransitionsPreset(wf)}
                        >
                          Sugerir Fluxo Sequencial (1 → 2 → 3...)
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleSaveTransitionRules(wf.id, true)}
                          disabled={isPending}
                        >
                          Liberar Transição Livre
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {wf.stages.map((fromSt) =>
                        wf.stages
                          .filter((toSt) => toSt.id !== fromSt.id)
                          .map((toSt) => {
                            const key = `${fromSt.id}->${toSt.id}`;
                            const checked = selectedTransitionPairs.has(key);
                            return (
                              <label
                                key={key}
                                className={`flex cursor-pointer items-center gap-2 rounded-xs border px-2.5 py-2 text-xs ${
                                  checked
                                    ? 'border-brand-navy bg-white font-medium text-slate-900'
                                    : 'border-slate-200 bg-white/60 text-slate-600'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleTransitionPair(fromSt.id, toSt.id)}
                                  className="h-3.5 w-3.5 rounded-xs border-slate-300"
                                />
                                <span className="truncate">{fromSt.name}</span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                                <span className="truncate">{toSt.name}</span>
                              </label>
                            );
                          }),
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfiguringTransitionsWfId(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => handleSaveTransitionRules(wf.id, false)}
                        disabled={isPending}
                      >
                        Salvar Regras de Transição ({selectedTransitionPairs.size})
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Lista Ordenada de Etapas da Esteira */}
                <div className="space-y-2">
                  {wf.stages.map((stage, idx) => {
                    const isEditingThisStage = editingStageId === stage.id;
                    const isArchivingThisStage = archivingStageId === stage.id;

                    return (
                      <div
                        key={stage.id}
                        className="rounded-md border border-slate-200 bg-slate-50/60 p-3"
                      >
                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-brand-navy inline-flex h-6 w-6 items-center justify-center rounded-xs font-mono text-xs font-semibold text-white">
                              {stage.position}
                            </span>
                            <span className="text-xs font-semibold text-slate-900">
                              {stage.name}
                            </span>
                            {stage.isInitial ? (
                              <Badge variant="emerald">Etapa Inicial</Badge>
                            ) : null}
                            <Badge variant={STATUS_CATEGORY_BADGE[stage.category]}>
                              {STATUS_CATEGORY_LABELS[stage.category]} ({stage.category})
                            </Badge>
                            <span className="font-mono text-[11px] text-slate-500">
                              {stage.demandsCount} demanda(s)
                            </span>
                          </div>

                          {canWrite ? (
                            <div className="flex flex-wrap items-center gap-1">
                              {!stage.isInitial ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMakeInitialStage(wf, stage.id)}
                                  disabled={isPending}
                                  title="Tornar Etapa Inicial (mover para Posição 1)"
                                >
                                  Tornar Inicial
                                </Button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleMoveStage(wf, idx, 'up')}
                                disabled={isPending || idx === 0}
                                className="rounded-xs border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                                title="Mover etapa para cima"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveStage(wf, idx, 'down')}
                                disabled={isPending || idx === wf.stages.length - 1}
                                className="rounded-xs border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                                title="Mover etapa para baixo"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  isEditingThisStage
                                    ? setEditingStageId(null)
                                    : startEditStage(stage)
                                }
                                className="rounded-xs border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                                title="Editar nome e categoria da etapa"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              {wf.stages.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => handleArchiveStage(stage, wf)}
                                  disabled={isPending}
                                  className="rounded-xs border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                  title="Arquivar etapa"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        {/* Formulário inline de Edição da Etapa */}
                        {isEditingThisStage && canWrite ? (
                          <form
                            onSubmit={(e) => handleUpdateStageSubmit(e, stage.id)}
                            className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-end"
                          >
                            <div className="flex-1">
                              <FormField
                                label="Nome da Etapa"
                                id={`edit-stage-name-${stage.id}`}
                                required
                              >
                                <Input
                                  id={`edit-stage-name-${stage.id}`}
                                  value={editStageName}
                                  onChange={(e) => setEditStageName(e.target.value)}
                                  required
                                />
                              </FormField>
                            </div>
                            <div className="sm:w-64">
                              <FormField
                                label="Categoria Canônica"
                                id={`edit-stage-cat-${stage.id}`}
                                required
                              >
                                <select
                                  id={`edit-stage-cat-${stage.id}`}
                                  value={editStageCategory}
                                  onChange={(e) =>
                                    setEditStageCategory(e.target.value as WorkflowStageCategory)
                                  }
                                  className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900"
                                >
                                  <option value="backlog">Triagem / Backlog (backlog)</option>
                                  <option value="active">Em Execução (active)</option>
                                  <option value="waiting">Aguardando (waiting)</option>
                                  <option value="done">Concluída (done)</option>
                                  <option value="cancelled">Cancelada (cancelled)</option>
                                </select>
                              </FormField>
                            </div>
                            <Button type="submit" variant="default" size="sm" disabled={isPending}>
                              Salvar Etapa
                            </Button>
                          </form>
                        ) : null}

                        {/* Confirmação de Migração ao Arquivar Etapa com Demandas */}
                        {isArchivingThisStage && canWrite ? (
                          <div className="mt-3 flex flex-col justify-between gap-3 rounded-xs border border-amber-200 bg-amber-50 p-3 text-xs sm:flex-row sm:items-center">
                            <div>
                              <p className="font-semibold text-amber-950">
                                Integridade Referencial: {stage.demandsCount} demanda(s) nesta etapa
                              </p>
                              <p className="text-[11px] text-amber-900">
                                Selecione a etapa substituta para onde as demandas atuais devem ser
                                migradas antes de arquivar &ldquo;{stage.name}&rdquo;:
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={fallbackStageId}
                                onChange={(e) => setFallbackStageId(e.target.value)}
                                aria-label="Etapa substituta"
                                className="h-8 rounded-md border border-amber-300 bg-white px-2.5 text-xs text-slate-900"
                              >
                                {wf.stages
                                  .filter((s) => s.id !== stage.id)
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.position}. {s.name}
                                    </option>
                                  ))}
                              </select>
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={() => handleArchiveStage(stage, wf)}
                                disabled={isPending}
                              >
                                Confirmar e Migrar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setArchivingStageId(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Associação entre Tipos de Serviço e Esteiras (Workflows) */}
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de Serviços e Vínculo com Esteiras (`service_types`)</CardTitle>
          <CardDescription>
            Defina qual workflow padrão é carregado automaticamente na abertura de demandas de cada
            tipo de serviço.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serviceTypes.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum tipo de serviço cadastrado.</p>
          ) : (
            <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
              {serviceTypes.map((svc) => (
                <div
                  key={svc.id}
                  className="flex flex-col justify-between gap-3 p-3.5 text-xs sm:flex-row sm:items-center"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{svc.categoryName}</Badge>
                      <span className="font-semibold text-slate-900">{svc.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Departamento padrão: {svc.defaultDepartmentName ?? 'Não fixado'}
                      {svc.defaultDueDays ? ` · Prazo sugerido: ${svc.defaultDueDays} dias` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Esteira:</span>
                    {canWrite ? (
                      <select
                        value={svc.defaultWorkflowId}
                        onChange={(e) => handleServiceTypeWorkflowChange(svc.id, e.target.value)}
                        disabled={isPending}
                        aria-label={`Esteira padrão para ${svc.name}`}
                        className="focus-visible:ring-brand-navy h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                      >
                        {workflows.map((wf) => (
                          <option key={wf.id} value={wf.id}>
                            {wf.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant="default">{svc.defaultWorkflowName}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

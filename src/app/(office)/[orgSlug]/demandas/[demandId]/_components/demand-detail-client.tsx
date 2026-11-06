'use client';

import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  GitCommitHorizontal,
  Landmark,
  MessageSquare,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { FormField } from '@/components/shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  addDemandCommentAction,
  addDemandParticipantAction,
  removeDemandParticipantAction,
  transitionDemandStageAction,
  updateDemandAction,
} from '@/server/modules/demands/actions';
import type {
  DemandPriority,
  DemandWorkflowStageOption,
  ParticipantRole,
  WorkflowStageCategory,
} from '@/server/modules/demands/service';
import {
  type DemandClientOption,
  type DemandCompanyOption,
  type DemandDepartmentOption,
  type DemandMemberOption,
  formatCnpj,
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  STATUS_CATEGORY_BADGE,
  STATUS_CATEGORY_LABELS,
} from '../../_components/demands-list-client';

export interface SerializedDemandParticipant {
  id: string;
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: ParticipantRole;
  createdAt: string;
}

export interface SerializedStageHistoryEntry {
  id: string;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string;
  toStageName: string;
  toStageCategory: WorkflowStageCategory;
  movedByMembershipId: string;
  movedByName: string;
  note: string | null;
  movedAt: string;
}

export interface SerializedDemandComment {
  id: string;
  authorMembershipId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  visibility: 'internal' | 'external';
  createdAt: string;
}

export interface SerializedAuditLogEntry {
  id: string;
  action: string;
  actorName: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

export interface SerializedDemandDetails {
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
  workflowName: string;
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
  createdByMembershipId: string;
  createdByName: string;
  availableStages: DemandWorkflowStageOption[];
  allowedTargetStageIds: string[];
  participants: SerializedDemandParticipant[];
  stageHistory: SerializedStageHistoryEntry[];
  comments: SerializedDemandComment[];
  activityTimeline: SerializedAuditLogEntry[];
}

interface DemandDetailClientProps {
  orgSlug: string;
  demand: SerializedDemandDetails;
  canUpdate: boolean;
  canAssign: boolean;
  clients: DemandClientOption[];
  companies: DemandCompanyOption[];
  departments: DemandDepartmentOption[];
  members: DemandMemberOption[];
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'demand.created': 'Demanda aberta e registrada',
  'demand.stage_transitioned': 'Transição de etapa do workflow',
  'demand.updated': 'Dados operacionais atualizados',
  'demand.participant_added': 'Participante interno vinculado',
  'demand.participant_removed': 'Participante interno removido',
  'demand.comment_added': 'Comentário interno registrado',
};

function formatDateBr(isoDate: string | null): string {
  if (!isoDate) return 'Não definido';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDateTimeBr(isoDateTime: string | null): string {
  if (!isoDateTime) return '—';
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAuditSummary(action: string, changes: Record<string, unknown> | null): string {
  if (!changes) return '';
  if (action === 'demand.stage_transitioned') {
    const fromName = typeof changes.fromStageName === 'string' ? changes.fromStageName : 'Anterior';
    const toName = typeof changes.toStageName === 'string' ? changes.toStageName : 'Nova etapa';
    const note =
      typeof changes.note === 'string' && changes.note ? ` · Obs.: "${changes.note}"` : '';
    return `Etapa alterada de "${fromName}" para "${toName}"${note}`;
  }
  if (action === 'demand.created') {
    const stageName = typeof changes.stageName === 'string' ? changes.stageName : 'Triagem';
    return `Iniciada na etapa "${stageName}"`;
  }
  if (action === 'demand.updated') {
    const parts: string[] = [];
    if (changes.previousTitle !== changes.newTitle) {
      parts.push(`Título alterado para "${String(changes.newTitle)}"`);
    }
    if (changes.previousPriority !== changes.newPriority) {
      parts.push(`Prioridade alterada para ${String(changes.newPriority)}`);
    }
    if (changes.previousDueDate !== changes.newDueDate) {
      parts.push(`Prazo atualizado para ${formatDateBr((changes.newDueDate as string) ?? null)}`);
    }
    if (changes.previousDepartmentId !== changes.newDepartmentId) {
      parts.push('Departamento responsável alterado');
    }
    if (changes.previousAssigneeMembershipId !== changes.newAssigneeMembershipId) {
      parts.push('Analista atribuído atualizado');
    }
    if (
      changes.previousClientId !== changes.newClientId ||
      changes.previousCompanyId !== changes.newCompanyId
    ) {
      parts.push('Vínculo Cliente/Empresa atualizado');
    }
    return parts.length > 0 ? parts.join(' · ') : 'Cadastro operacional revisado';
  }
  if (action === 'demand.comment_added') {
    return typeof changes.preview === 'string' ? `"${changes.preview}"` : '';
  }
  return '';
}

export function DemandDetailClient({
  orgSlug,
  demand,
  canUpdate,
  canAssign,
  clients,
  companies,
  departments,
  members,
}: DemandDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Estado para transição de etapa do workflow
  const [targetStageId, setTargetStageId] = useState(
    demand.allowedTargetStageIds[0] ?? demand.stageId,
  );
  const [transitionNote, setTransitionNote] = useState('');

  // Estado para edição dos dados vinculados da demanda
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(demand.title);
  const [editDescription, setEditDescription] = useState(demand.description ?? '');
  const [editClientId, setEditClientId] = useState(demand.clientId);
  const [editCompanyId, setEditCompanyId] = useState(demand.companyId ?? '');
  const [editDepartmentId, setEditDepartmentId] = useState(demand.departmentId);
  const [editAssigneeId, setEditAssigneeId] = useState(demand.assigneeMembershipId ?? '');
  const [editPriority, setEditPriority] = useState<DemandPriority>(demand.priority);
  const [editDueDate, setEditDueDate] = useState(demand.dueDate ?? '');

  // Estado para adicionar participante
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [selectedParticipantRole, setSelectedParticipantRole] =
    useState<ParticipantRole>('collaborator');

  // Estado para novo comentário interno
  const [commentBody, setCommentBody] = useState('');

  // Empresas filtradas pelo cliente selecionado no modo de edição (garantia de FK tripla)
  const editCompanyOptions = useMemo(() => {
    return companies.filter((c) => c.clientId === editClientId);
  }, [companies, editClientId]);

  const isOverdue = useMemo(() => {
    if (
      !demand.dueDate ||
      demand.statusCategory === 'done' ||
      demand.statusCategory === 'cancelled'
    ) {
      return false;
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    return demand.dueDate.slice(0, 10) < todayIso;
  }, [demand.dueDate, demand.statusCategory]);

  function handleTransitionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetStageId || targetStageId === demand.stageId) {
      setFeedback({
        type: 'error',
        message: 'Selecione uma etapa diferente da etapa atual para realizar a transição.',
      });
      return;
    }
    setFeedback(null);

    startTransition(async () => {
      const result = await transitionDemandStageAction({
        orgSlug,
        demandId: demand.id,
        toStageId: targetStageId,
        note: transitionNote || null,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: 'Etapa do workflow e status atualizados e registrados na auditoria.',
      });
      setTransitionNote('');
      router.refresh();
    });
  }

  function handleQuickStageSelect(stageId: string) {
    setTargetStageId(stageId);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const result = await updateDemandAction({
        orgSlug,
        demandId: demand.id,
        title: editTitle,
        description: editDescription || null,
        clientId: editClientId,
        companyId: editCompanyId || null,
        departmentId: editDepartmentId,
        assigneeMembershipId: editAssigneeId || null,
        priority: editPriority,
        dueDate: editDueDate || null,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Dados operacionais da demanda ${result.data.code} atualizados com sucesso.`,
      });
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleAddParticipant(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedParticipantId) return;
    setFeedback(null);

    startTransition(async () => {
      const result = await addDemandParticipantAction({
        orgSlug,
        demandId: demand.id,
        membershipId: selectedParticipantId,
        role: selectedParticipantRole,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setSelectedParticipantId('');
      setFeedback({ type: 'success', message: 'Participante vinculado à demanda.' });
      router.refresh();
    });
  }

  function handleRemoveParticipant(membershipId: string) {
    setFeedback(null);

    startTransition(async () => {
      const result = await removeDemandParticipantAction({
        orgSlug,
        demandId: demand.id,
        membershipId,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setFeedback({ type: 'success', message: 'Participante removido da demanda.' });
      router.refresh();
    });
  }

  function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setFeedback(null);

    startTransition(async () => {
      const result = await addDemandCommentAction({
        orgSlug,
        demandId: demand.id,
        body: commentBody,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      setCommentBody('');
      setFeedback({ type: 'success', message: 'Comentário interno registrado na demanda.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Navegação superior */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/${orgSlug}/demandas`}
          className="hover:text-brand-navy inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para Demandas e Ordens de Serviço
        </Link>

        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <ShieldCheck className="mr-1 h-3 w-3 text-emerald-600" />
            Auditoria Imutável Ativa
          </Badge>
        </div>
      </div>

      {/* Cabeçalho da Demanda */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-brand-navy rounded-xs px-2.5 py-0.5 font-mono text-xs font-semibold text-white">
                  {demand.code}
                </span>
                <Badge variant={STATUS_CATEGORY_BADGE[demand.statusCategory]}>
                  {demand.stageName} · {STATUS_CATEGORY_LABELS[demand.statusCategory]}
                </Badge>
                <Badge variant={PRIORITY_BADGE[demand.priority]}>
                  Prioridade {PRIORITY_LABELS[demand.priority]}
                </Badge>
                <span className="text-xs text-slate-500">
                  {demand.serviceCategoryName} · {demand.serviceTypeName}
                </span>
              </div>

              <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">{demand.title}</h1>

              {demand.description ? (
                <p className="max-w-3xl text-xs leading-relaxed text-slate-600">
                  {demand.description}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Nenhuma descrição detalhada informada nesta demanda.
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3 lg:flex-col lg:items-end">
              <div
                className={`rounded-md border px-3 py-2 text-right ${
                  isOverdue
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                <p className="text-[10px] font-medium tracking-wider uppercase opacity-75">
                  Prazo Fatal (Due Date)
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs font-semibold">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDateBr(demand.dueDate)}
                  {isOverdue ? <span className="text-[10px] uppercase">(Vencido)</span> : null}
                </p>
              </div>

              {canUpdate ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing((prev) => !prev)}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  {isEditing ? 'Cancelar edição' : 'Editar dados da demanda'}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback de mutação */}
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

      {/* Esteira de Etapas do Workflow e Controle de Transição */}
      <Card>
        <CardHeader>
          <CardTitle>Esteira de Workflow · {demand.workflowName}</CardTitle>
          <CardDescription>
            O status da demanda é derivado automaticamente da categoria da etapa atual (Decisão A6).
            Cada transição respeita as regras configuradas na esteira e grava registro em
            demand_stage_history e no activity_log imutável.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5">
            {demand.availableStages.map((stage) => {
              const isCurrent = stage.id === demand.stageId;
              const isAllowedTarget = isCurrent || demand.allowedTargetStageIds.includes(stage.id);
              const isSelectedTarget = stage.id === targetStageId;
              return (
                <button
                  key={stage.id}
                  type="button"
                  disabled={!canUpdate || !isAllowedTarget}
                  onClick={() => handleQuickStageSelect(stage.id)}
                  className={`flex flex-col justify-between rounded-md border p-3 text-left transition-all ${
                    isCurrent
                      ? 'border-brand-navy bg-brand-navy/5 ring-brand-navy/30 ring-1'
                      : !isAllowedTarget
                        ? 'border-slate-200 bg-slate-50/70 opacity-55'
                        : isSelectedTarget && canUpdate
                          ? 'border-emerald-500 bg-emerald-50/40'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${!canUpdate || !isAllowedTarget ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] font-semibold text-slate-400">
                      ETAPA {stage.position}
                    </span>
                    {isCurrent ? (
                      <Badge variant="default">Atual</Badge>
                    ) : !isAllowedTarget ? (
                      <Badge variant="outline">Bloqueada</Badge>
                    ) : isSelectedTarget && canUpdate ? (
                      <Badge variant="emerald">Destino</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-slate-900">{stage.name}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {STATUS_CATEGORY_LABELS[stage.category]}
                  </p>
                </button>
              );
            })}
          </div>

          {canUpdate ? (
            <form
              onSubmit={handleTransitionSubmit}
              className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3.5 sm:flex-row sm:items-end"
            >
              <div className="sm:w-64">
                <FormField label="Transicionar para Etapa" id="transition-stage-select">
                  <select
                    id="transition-stage-select"
                    value={targetStageId}
                    onChange={(e) => setTargetStageId(e.target.value)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                  >
                    {demand.availableStages.map((stage) => {
                      const isCurrent = stage.id === demand.stageId;
                      const isAllowedTarget =
                        isCurrent || demand.allowedTargetStageIds.includes(stage.id);
                      return (
                        <option key={stage.id} value={stage.id} disabled={!isAllowedTarget}>
                          {stage.position}. {stage.name} ({STATUS_CATEGORY_LABELS[stage.category]})
                          {isCurrent ? ' — Atual' : !isAllowedTarget ? ' — Bloqueada' : ''}
                        </option>
                      );
                    })}
                  </select>
                </FormField>
              </div>

              <div className="flex-1">
                <FormField
                  label="Observação / Despacho da Transição (Auditado)"
                  id="transition-note"
                >
                  <Input
                    id="transition-note"
                    value={transitionNote}
                    onChange={(e) => setTransitionNote(e.target.value)}
                    placeholder="Ex.: Minuta revisada e protocolada perante a Junta Comercial..."
                  />
                </FormField>
              </div>

              <Button
                type="submit"
                variant="default"
                disabled={isPending || targetStageId === demand.stageId}
              >
                <ArrowRight className="h-4 w-4" />
                {isPending ? 'Transicionando...' : 'Confirmar Transição'}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {/* Formulário de Edição (quando ativado) */}
      {isEditing && canUpdate ? (
        <Card className="border-brand-navy/30">
          <CardHeader>
            <CardTitle>Editar Dados Vinculados da Demanda ({demand.code})</CardTitle>
            <CardDescription>
              A alteração de empresa valida a integridade da FK tripla (Cliente–Empresa). A
              reatribuição de departamento ou analista requer permissão de coordenação/gestão
              (demand.assign).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2">
                  <FormField label="Título da Demanda" id="edit-demand-title" required>
                    <Input
                      id="edit-demand-title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      required
                    />
                  </FormField>
                </div>

                <FormField label="Prioridade" id="edit-demand-priority" required>
                  <select
                    id="edit-demand-priority"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as DemandPriority)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </FormField>

                <FormField label="Cliente Vinculado" id="edit-demand-client" required>
                  <select
                    id="edit-demand-client"
                    value={editClientId}
                    onChange={(e) => {
                      const nextClientId = e.target.value;
                      setEditClientId(nextClientId);
                      setEditCompanyId((prev) => {
                        const valid = companies.some(
                          (c) => c.id === prev && c.clientId === nextClientId,
                        );
                        return valid ? prev : '';
                      });
                    }}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                    required
                  >
                    {clients.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Empresa (Pessoa Jurídica — FK Tripla)" id="edit-demand-company">
                  <select
                    id="edit-demand-company"
                    value={editCompanyId}
                    onChange={(e) => setEditCompanyId(e.target.value)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                  >
                    <option value="">Sem pessoa jurídica específica</option>
                    {editCompanyOptions.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.legalName} ({formatCnpj(comp.cnpj)})
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Prazo Fatal (Due Date)" id="edit-demand-due-date">
                  <Input
                    id="edit-demand-due-date"
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                </FormField>

                <FormField
                  label="Departamento Responsável"
                  id="edit-demand-department"
                  hint={
                    !canAssign ? 'Reatribuição restrita a Coordenador/Gestor/Admin.' : undefined
                  }
                  required
                >
                  <select
                    id="edit-demand-department"
                    value={editDepartmentId}
                    onChange={(e) => setEditDepartmentId(e.target.value)}
                    disabled={!canAssign}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  label="Analista / Responsável Atribuído"
                  id="edit-demand-assignee"
                  hint={
                    !canAssign ? 'Reatribuição restrita a Coordenador/Gestor/Admin.' : undefined
                  }
                >
                  <select
                    id="edit-demand-assignee"
                    value={editAssigneeId}
                    onChange={(e) => setEditAssigneeId(e.target.value)}
                    disabled={!canAssign}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">Não atribuído</option>
                    {members.map((m) => (
                      <option key={m.membershipId} value={m.membershipId}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                </FormField>

                <div className="sm:col-span-3">
                  <FormField label="Descrição e Escopo Operacional" id="edit-demand-description">
                    <textarea
                      id="edit-demand-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      className="focus-visible:ring-brand-navy w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                    />
                  </FormField>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="default" disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Grade de Detalhes: Dados Vinculados + Participantes & Comentários */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna 1: Ficha Técnica e Dados Vinculados */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados Operacionais Vinculados</CardTitle>
              <CardDescription>
                Relacionamentos validados por organização (FK composta e FK tripla)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-[10px] font-medium text-slate-500 uppercase">
                  Cliente Contratante
                </p>
                <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900">
                  <Building2 className="h-3.5 w-3.5 text-slate-500" />
                  <span>{demand.clientName}</span>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-[10px] font-medium text-slate-500 uppercase">
                  Empresa Vinculada (PJ)
                </p>
                {demand.companyLegalName ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                      <Landmark className="h-3.5 w-3.5 text-slate-500" />
                      <span>{demand.companyLegalName}</span>
                    </div>
                    {demand.companyCnpj ? (
                      <p className="font-mono text-[11px] text-slate-500">
                        CNPJ: {formatCnpj(demand.companyCnpj)}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-1 text-slate-500">Sem pessoa jurídica específica vinculada</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <p className="text-[10px] font-medium text-slate-500 uppercase">Departamento</p>
                  <p className="mt-1 font-semibold text-slate-900">{demand.departmentName}</p>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <p className="text-[10px] font-medium text-slate-500 uppercase">
                    Analista Responsável
                  </p>
                  <p className="mt-1 flex items-center gap-1 font-semibold text-slate-900">
                    <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                    <span className="truncate">{demand.assigneeName ?? 'Não atribuído'}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-200 pt-3 text-[11px] text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-500">Aberta por:</span>
                  <span className="font-medium text-slate-800">{demand.createdByName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Data de abertura:</span>
                  <span className="font-mono">{formatDateTimeBr(demand.openedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Última atualização:</span>
                  <span className="font-mono">{formatDateTimeBr(demand.updatedAt)}</span>
                </div>
                {demand.completedAt ? (
                  <div className="flex justify-between text-emerald-700">
                    <span className="font-medium">Concluída em:</span>
                    <span className="font-mono font-semibold">
                      {formatDateTimeBr(demand.completedAt)}
                    </span>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Participantes Internos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                Participantes Internos ({demand.participants.length})
              </CardTitle>
              <CardDescription>
                Colaboradores e observadores com acesso direto ao acompanhamento desta demanda
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {demand.participants.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhum participante adicional vinculado além do responsável principal.
                </p>
              ) : (
                <ul className="space-y-2">
                  {demand.participants.map((part) => (
                    <li
                      key={part.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{part.name}</p>
                        <p className="truncate text-[11px] text-slate-500">{part.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline">
                          {part.role === 'collaborator' ? 'Colaborador' : 'Observador'}
                        </Badge>
                        {canUpdate ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveParticipant(part.membershipId)}
                            disabled={isPending}
                            className="rounded-xs p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Remover participante"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {canUpdate ? (
                <form
                  onSubmit={handleAddParticipant}
                  className="space-y-2 border-t border-slate-200 pt-3"
                >
                  <p className="text-[11px] font-medium text-slate-600">Adicionar participante</p>
                  <div className="flex flex-col gap-2">
                    <select
                      value={selectedParticipantId}
                      onChange={(e) => setSelectedParticipantId(e.target.value)}
                      aria-label="Selecionar membro participante"
                      className="focus-visible:ring-brand-navy h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                    >
                      <option value="">Selecione um membro...</option>
                      {members.map((m) => (
                        <option key={m.membershipId} value={m.membershipId}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <select
                        value={selectedParticipantRole}
                        onChange={(e) =>
                          setSelectedParticipantRole(e.target.value as ParticipantRole)
                        }
                        aria-label="Papel do participante"
                        className="focus-visible:ring-brand-navy h-8 flex-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900"
                      >
                        <option value="collaborator">Colaborador</option>
                        <option value="watcher">Observador</option>
                      </select>
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={isPending || !selectedParticipantId}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Vincular
                      </Button>
                    </div>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Colunas 2 e 3: Linha do Tempo de Etapas, Auditoria Imutável e Comentários */}
        <div className="space-y-6 lg:col-span-2">
          {/* Histórico de Transições de Etapa (demand_stage_history) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCommitHorizontal className="text-brand-navy h-4 w-4" />
                Histórico de Transições de Etapa ({demand.stageHistory.length})
              </CardTitle>
              <CardDescription>
                Rastreabilidade completa de movimentações entre etapas do workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              {demand.stageHistory.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhuma transição registrada.</p>
              ) : (
                <ol className="relative ml-2 space-y-3 border-l border-slate-200 pl-4">
                  {demand.stageHistory.map((entry) => (
                    <li key={entry.id} className="relative text-xs">
                      <span
                        className="bg-brand-navy absolute top-1 -left-[21px] h-2.5 w-2.5 rounded-full ring-4 ring-white"
                        aria-hidden="true"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900">
                          {entry.fromStageName ? (
                            <>
                              <span className="text-slate-600">{entry.fromStageName}</span>
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                            </>
                          ) : (
                            <span className="text-slate-500">Início →</span>
                          )}
                          <Badge variant={STATUS_CATEGORY_BADGE[entry.toStageCategory]}>
                            {entry.toStageName}
                          </Badge>
                        </div>
                        <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                          <Clock className="h-3 w-3" />
                          {formatDateTimeBr(entry.movedAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Movimentado por <span className="font-medium">{entry.movedByName}</span>
                        {entry.note ? ` · Despacho: "${entry.note}"` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Comentários Operacionais Internos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-500" />
                Apontamentos e Comentários Internos ({demand.comments.length})
              </CardTitle>
              <CardDescription>
                Comunicação interna da equipe técnica vinculada a esta ordem de serviço
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {demand.comments.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhum apontamento interno registrado até o momento.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {demand.comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{c.authorName}</span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {formatDateTimeBr(c.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-slate-700">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {canUpdate ? (
                <form onSubmit={handleAddComment} className="space-y-2 pt-1">
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    rows={2}
                    placeholder="Registrar despacho interno, pendência documental ou instrução para a equipe..."
                    className="focus-visible:ring-brand-navy w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={isPending || commentBody.trim().length < 2}
                    >
                      Registrar Comentário Interno
                    </Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>

          {/* Linha do Tempo de Auditoria Imutável (activity_log) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="text-brand-emerald h-4 w-4" />
                Linha do Tempo de Auditoria Imutável · activity_log (
                {demand.activityTimeline.length})
              </CardTitle>
              <CardDescription>
                Eventos gravados em modo append-only no banco de dados para conformidade e auditoria
              </CardDescription>
            </CardHeader>
            <CardContent>
              {demand.activityTimeline.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum evento de auditoria registrado.</p>
              ) : (
                <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
                  {demand.activityTimeline.map((log) => {
                    const summary = formatAuditSummary(log.action, log.changes);
                    return (
                      <div key={log.id} className="space-y-1 p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                            </span>
                            <span className="rounded-xs bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                              {log.action}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500">
                            {formatDateTimeBr(log.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Autor:{' '}
                          <span className="font-medium text-slate-800">
                            {log.actorName ?? 'Sistema'}
                          </span>
                          {summary ? ` · ${summary}` : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

import 'server-only';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { assertPermission } from '@/server/authz/permissions';
import type { OfficeTenantContext } from '@/server/context/tenant-context';
import { getDb } from '@/server/db/client';
import {
  activityLog,
  demands,
  departments,
  serviceCategories,
  serviceTypes,
  workflows,
  workflowStages,
  workflowTransitions,
} from '@/server/db/schema';
import { type AnyPgDatabase, withTenant } from '@/server/db/tenant';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app-error';
import type { WorkflowStageCategory } from '@/server/modules/demands/service';

export interface WorkflowStageDTO {
  id: string;
  workflowId: string;
  name: string;
  position: number;
  category: WorkflowStageCategory;
  clientVisible: boolean;
  clientLabel: string | null;
  isInitial: boolean;
  demandsCount: number;
}

export interface WorkflowTransitionRuleDTO {
  id: string;
  workflowId: string;
  fromStageId: string;
  toStageId: string;
}

export interface WorkflowDTO {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  stages: WorkflowStageDTO[];
  transitions: WorkflowTransitionRuleDTO[];
  demandsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceCategoryDTO {
  id: string;
  name: string;
  position: number;
}

export interface ServiceTypeWithWorkflowDTO {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  defaultDepartmentId: string | null;
  defaultDepartmentName: string | null;
  defaultWorkflowId: string;
  defaultWorkflowName: string;
  defaultDueDays: number | null;
  active: boolean;
}

export interface WorkflowsCatalogDTO {
  workflows: WorkflowDTO[];
  serviceCategories: ServiceCategoryDTO[];
  serviceTypes: ServiceTypeWithWorkflowDTO[];
}

export interface CreateWorkflowStageInput {
  name: string;
  category: WorkflowStageCategory;
  clientVisible?: boolean;
  clientLabel?: string | null;
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { code?: string; cause?: { code?: string }; message?: string };
  if (candidate.code === '23505' || candidate.cause?.code === '23505') return true;
  if (typeof candidate.message === 'string' && candidate.message.includes('unique')) return true;
  return false;
}

/**
 * Lista todas as esteiras (workflows) ativas da organização com suas etapas ordenadas,
 * regras de transição configuradas, contagem de demandas vinculadas e tipos de serviço.
 */
export async function listOrganizationWorkflowsCatalog(
  ctx: OfficeTenantContext,
  database: AnyPgDatabase = getDb(),
): Promise<WorkflowsCatalogDTO> {
  assertPermission(ctx, 'workflow.read');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const wfRows = await tx
        .select()
        .from(workflows)
        .where(and(eq(workflows.organizationId, ctx.organizationId), isNull(workflows.archivedAt)))
        .orderBy(asc(workflows.createdAt));

      const stageRows = await tx
        .select()
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            isNull(workflowStages.archivedAt),
          ),
        )
        .orderBy(asc(workflowStages.workflowId), asc(workflowStages.position));

      const transitionRows = await tx
        .select()
        .from(workflowTransitions)
        .where(eq(workflowTransitions.organizationId, ctx.organizationId));

      const demandStageCounts = await tx
        .select({
          stageId: demands.stageId,
          workflowId: demands.workflowId,
          count: sql<number>`count(*)::int`,
        })
        .from(demands)
        .where(and(eq(demands.organizationId, ctx.organizationId), isNull(demands.archivedAt)))
        .groupBy(demands.workflowId, demands.stageId);

      const stageCountMap = new Map<string, number>();
      const workflowCountMap = new Map<string, number>();
      for (const row of demandStageCounts) {
        stageCountMap.set(row.stageId, (stageCountMap.get(row.stageId) ?? 0) + row.count);
        workflowCountMap.set(
          row.workflowId,
          (workflowCountMap.get(row.workflowId) ?? 0) + row.count,
        );
      }

      const stagesByWorkflow = new Map<string, WorkflowStageDTO[]>();
      for (const st of stageRows) {
        const list = stagesByWorkflow.get(st.workflowId) ?? [];
        list.push({
          id: st.id,
          workflowId: st.workflowId,
          name: st.name,
          position: st.position,
          category: st.category,
          clientVisible: st.clientVisible,
          clientLabel: st.clientLabel,
          isInitial: false,
          demandsCount: stageCountMap.get(st.id) ?? 0,
        });
        stagesByWorkflow.set(st.workflowId, list);
      }

      // Marca a primeira etapa ativa (menor position) como etapa inicial da esteira
      for (const list of stagesByWorkflow.values()) {
        list.sort((a, b) => a.position - b.position);
        if (list[0]) {
          list[0].isInitial = true;
        }
      }

      const transitionsByWorkflow = new Map<string, WorkflowTransitionRuleDTO[]>();
      for (const tr of transitionRows) {
        const list = transitionsByWorkflow.get(tr.workflowId) ?? [];
        list.push({
          id: tr.id,
          workflowId: tr.workflowId,
          fromStageId: tr.fromStageId,
          toStageId: tr.toStageId,
        });
        transitionsByWorkflow.set(tr.workflowId, list);
      }

      const catRows = await tx
        .select()
        .from(serviceCategories)
        .where(eq(serviceCategories.organizationId, ctx.organizationId))
        .orderBy(asc(serviceCategories.position), asc(serviceCategories.name));

      const svcRows = await tx
        .select({
          id: serviceTypes.id,
          categoryId: serviceTypes.categoryId,
          categoryName: serviceCategories.name,
          name: serviceTypes.name,
          description: serviceTypes.description,
          defaultDepartmentId: serviceTypes.defaultDepartmentId,
          defaultDepartmentName: departments.name,
          defaultWorkflowId: serviceTypes.defaultWorkflowId,
          defaultWorkflowName: workflows.name,
          defaultDueDays: serviceTypes.defaultDueDays,
          active: serviceTypes.active,
        })
        .from(serviceTypes)
        .innerJoin(
          serviceCategories,
          and(
            eq(serviceCategories.organizationId, serviceTypes.organizationId),
            eq(serviceCategories.id, serviceTypes.categoryId),
          ),
        )
        .innerJoin(
          workflows,
          and(
            eq(workflows.organizationId, serviceTypes.organizationId),
            eq(workflows.id, serviceTypes.defaultWorkflowId),
          ),
        )
        .leftJoin(
          departments,
          and(
            eq(departments.organizationId, serviceTypes.organizationId),
            eq(departments.id, serviceTypes.defaultDepartmentId),
          ),
        )
        .where(eq(serviceTypes.organizationId, ctx.organizationId))
        .orderBy(asc(serviceCategories.position), asc(serviceTypes.name));

      return {
        workflows: wfRows.map((wf) => ({
          id: wf.id,
          name: wf.name,
          description: wf.description,
          isDefault: wf.isDefault,
          stages: stagesByWorkflow.get(wf.id) ?? [],
          transitions: transitionsByWorkflow.get(wf.id) ?? [],
          demandsCount: workflowCountMap.get(wf.id) ?? 0,
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
        })),
        serviceCategories: catRows.map((c) => ({
          id: c.id,
          name: c.name,
          position: c.position,
        })),
        serviceTypes: svcRows,
      };
    },
    database,
  );
}

/**
 * Cria uma nova esteira de atendimento (`workflow`) com suas etapas ordenadas (`workflow_stages`).
 * Caso `stages` não seja informado, cria o conjunto padrão de 4 etapas (Triagem, Em Execução, Aguardando, Concluída).
 */
export async function createWorkflow(
  ctx: OfficeTenantContext,
  input: {
    name: string;
    description?: string | null;
    isDefault?: boolean;
    stages?: CreateWorkflowStageInput[];
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; name: string; stagesCount: number }> {
  assertPermission(ctx, 'workflow.write');

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new ValidationError('O nome do workflow deve ter pelo menos 2 caracteres.');
  }

  const stagesInput: CreateWorkflowStageInput[] =
    input.stages && input.stages.length > 0
      ? input.stages
      : [
          { name: 'Triagem e Recebimento', category: 'backlog', clientVisible: true },
          { name: 'Em Execução Técnica', category: 'active', clientVisible: true },
          { name: 'Aguardando Órgão / Cliente', category: 'waiting', clientVisible: true },
          { name: 'Concluída', category: 'done', clientVisible: true },
        ];

  for (const st of stagesInput) {
    if (!st.name || st.name.trim().length < 2) {
      throw new ValidationError(
        'Todas as etapas do workflow devem ter nome com ao menos 2 caracteres.',
      );
    }
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      if (input.isDefault) {
        await tx
          .update(workflows)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(workflows.organizationId, ctx.organizationId));
      }

      let createdWf;
      try {
        const [row] = await tx
          .insert(workflows)
          .values({
            organizationId: ctx.organizationId,
            name: trimmedName,
            description: input.description?.trim() || null,
            isDefault: Boolean(input.isDefault),
          })
          .returning();
        createdWf = row!;
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new ConflictError('Já existe um workflow com este nome nesta organização.');
        }
        throw err;
      }

      const insertedStages = [];
      for (let i = 0; i < stagesInput.length; i++) {
        const st = stagesInput[i]!;
        const [createdStage] = await tx
          .insert(workflowStages)
          .values({
            organizationId: ctx.organizationId,
            workflowId: createdWf.id,
            name: st.name.trim(),
            position: i + 1,
            category: st.category,
            clientVisible: st.clientVisible ?? true,
            clientLabel: st.clientLabel?.trim() || st.name.trim(),
          })
          .returning();
        insertedStages.push(createdStage!);
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'workflow.created',
        entityType: 'workflow',
        entityId: createdWf.id,
        changes: {
          name: createdWf.name,
          isDefault: createdWf.isDefault,
          stages: insertedStages.map((s) => ({
            id: s.id,
            name: s.name,
            position: s.position,
            category: s.category,
          })),
        },
      });

      return {
        id: createdWf.id,
        name: createdWf.name,
        stagesCount: insertedStages.length,
      };
    },
    database,
  );
}

/**
 * Atualiza os metadados de um workflow (nome, descrição e marcação como esteira padrão da organização).
 */
export async function updateWorkflow(
  ctx: OfficeTenantContext,
  input: {
    workflowId: string;
    name: string;
    description?: string | null;
    isDefault?: boolean;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; name: string; isDefault: boolean }> {
  assertPermission(ctx, 'workflow.write');

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new ValidationError('O nome do workflow deve ter pelo menos 2 caracteres.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.organizationId, ctx.organizationId),
            eq(workflows.id, input.workflowId),
            isNull(workflows.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Workflow não encontrado nesta organização.');
      }

      if (input.isDefault) {
        await tx
          .update(workflows)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(eq(workflows.organizationId, ctx.organizationId), ne(workflows.id, existing.id)),
          );
      }

      let updated;
      try {
        const [row] = await tx
          .update(workflows)
          .set({
            name: trimmedName,
            description: input.description?.trim() || null,
            isDefault: input.isDefault !== undefined ? input.isDefault : existing.isDefault,
            updatedAt: new Date(),
          })
          .where(eq(workflows.id, existing.id))
          .returning();
        updated = row!;
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new ConflictError('Já existe outro workflow com este nome nesta organização.');
        }
        throw err;
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'workflow.updated',
        entityType: 'workflow',
        entityId: existing.id,
        changes: {
          previousName: existing.name,
          newName: updated.name,
          isDefault: updated.isDefault,
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        isDefault: updated.isDefault,
      };
    },
    database,
  );
}

/**
 * Adiciona uma nova etapa (`workflow_stage`) a um workflow existente.
 * Se `asInitialStage` for `true`, insere na posição 1 (etapa inicial) e desloca as demais.
 */
export async function createWorkflowStage(
  ctx: OfficeTenantContext,
  input: {
    workflowId: string;
    name: string;
    category: WorkflowStageCategory;
    asInitialStage?: boolean;
    clientVisible?: boolean;
    clientLabel?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<WorkflowStageDTO> {
  assertPermission(ctx, 'workflow.write');

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new ValidationError('O nome da etapa deve ter pelo menos 2 caracteres.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [wf] = await tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.organizationId, ctx.organizationId),
            eq(workflows.id, input.workflowId),
            isNull(workflows.archivedAt),
          ),
        )
        .limit(1);

      if (!wf) {
        throw new NotFoundError('Workflow não encontrado nesta organização.');
      }

      const activeStages = await tx
        .select()
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            eq(workflowStages.workflowId, wf.id),
            isNull(workflowStages.archivedAt),
          ),
        )
        .orderBy(asc(workflowStages.position));

      let targetPosition = activeStages.length + 1;

      if (input.asInitialStage && activeStages.length > 0) {
        targetPosition = 1;
        for (let i = 0; i < activeStages.length; i++) {
          await tx
            .update(workflowStages)
            .set({ position: i + 2, updatedAt: new Date() })
            .where(eq(workflowStages.id, activeStages[i]!.id));
        }
      }

      const [created] = await tx
        .insert(workflowStages)
        .values({
          organizationId: ctx.organizationId,
          workflowId: wf.id,
          name: trimmedName,
          position: targetPosition,
          category: input.category,
          clientVisible: input.clientVisible ?? true,
          clientLabel: input.clientLabel?.trim() || trimmedName,
        })
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'workflow.stage_created',
        entityType: 'workflow',
        entityId: wf.id,
        changes: {
          stageId: created!.id,
          stageName: created!.name,
          position: created!.position,
          category: created!.category,
          asInitialStage: Boolean(input.asInitialStage),
        },
      });

      return {
        id: created!.id,
        workflowId: created!.workflowId,
        name: created!.name,
        position: created!.position,
        category: created!.category,
        clientVisible: created!.clientVisible,
        clientLabel: created!.clientLabel,
        isInitial: targetPosition === 1,
        demandsCount: 0,
      };
    },
    database,
  );
}

/**
 * Atualiza uma etapa (`workflow_stage`) existente (nome, categoria canônica e visibilidade).
 * Caso a categoria canônica seja alterada, sincroniza automaticamente o `statusCategory` derivado
 * de todas as demandas atualmente posicionadas nessa etapa (Decisão A6).
 */
export async function updateWorkflowStage(
  ctx: OfficeTenantContext,
  input: {
    stageId: string;
    name: string;
    category: WorkflowStageCategory;
    clientVisible?: boolean;
    clientLabel?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; name: string; category: WorkflowStageCategory }> {
  assertPermission(ctx, 'workflow.write');

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new ValidationError('O nome da etapa deve ter pelo menos 2 caracteres.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            eq(workflowStages.id, input.stageId),
            isNull(workflowStages.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Etapa do workflow não encontrada nesta organização.');
      }

      const [updated] = await tx
        .update(workflowStages)
        .set({
          name: trimmedName,
          category: input.category,
          clientVisible:
            input.clientVisible !== undefined ? input.clientVisible : existing.clientVisible,
          clientLabel: input.clientLabel?.trim() || trimmedName,
          updatedAt: new Date(),
        })
        .where(eq(workflowStages.id, existing.id))
        .returning();

      // Mantém a integridade do status derivado (Decisão A6) nas demandas posicionadas nesta etapa
      if (existing.category !== input.category) {
        await tx
          .update(demands)
          .set({
            statusCategory: input.category,
            completedAt: input.category === 'done' ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(demands.organizationId, ctx.organizationId),
              eq(demands.stageId, existing.id),
              isNull(demands.archivedAt),
            ),
          );
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'workflow.stage_updated',
        entityType: 'workflow',
        entityId: existing.workflowId,
        changes: {
          stageId: existing.id,
          previousName: existing.name,
          newName: updated!.name,
          previousCategory: existing.category,
          newCategory: updated!.category,
        },
      });

      return {
        id: updated!.id,
        name: updated!.name,
        category: updated!.category,
      };
    },
    database,
  );
}

/**
 * Reordena as etapas ativas de um workflow (`1..N`).
 * A primeira etapa da lista (`orderedStageIds[0]`) passa a ser a etapa inicial (`position = 1`).
 */
export async function reorderWorkflowStages(
  ctx: OfficeTenantContext,
  input: {
    workflowId: string;
    orderedStageIds: string[];
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ workflowId: string; orderedStageIds: string[] }> {
  assertPermission(ctx, 'workflow.write');

  if (input.orderedStageIds.length === 0) {
    throw new ValidationError('Informe a ordem das etapas do workflow.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const activeStages = await tx
        .select()
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            eq(workflowStages.workflowId, input.workflowId),
            isNull(workflowStages.archivedAt),
          ),
        )
        .orderBy(asc(workflowStages.position));

      if (activeStages.length === 0) {
        throw new NotFoundError('Workflow não encontrado ou sem etapas ativas.');
      }

      const activeSet = new Set(activeStages.map((s) => s.id));
      const inputUnique = Array.from(new Set(input.orderedStageIds));

      if (
        inputUnique.length !== activeStages.length ||
        inputUnique.some((id) => !activeSet.has(id))
      ) {
        throw new ValidationError(
          'A lista de ordenação deve conter exatamente todas as etapas ativas deste workflow.',
        );
      }

      for (let idx = 0; idx < inputUnique.length; idx++) {
        await tx
          .update(workflowStages)
          .set({
            position: idx + 1,
            updatedAt: new Date(),
          })
          .where(eq(workflowStages.id, inputUnique[idx]!));
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'workflow.stages_reordered',
        entityType: 'workflow',
        entityId: input.workflowId,
        changes: {
          orderedStageIds: inputUnique,
          initialStageId: inputUnique[0],
        },
      });

      return {
        workflowId: input.workflowId,
        orderedStageIds: inputUnique,
      };
    },
    database,
  );
}

/**
 * Arquiva uma etapa (`workflow_stage`) preservando a integridade referencial com demandas existentes:
 * - Não permite arquivar a única etapa ativa de um workflow.
 * - Se existirem demandas posicionadas na etapa, exige `fallbackStageId` para migrá-las ou lança `ConflictError`.
 */
export async function archiveWorkflowStage(
  ctx: OfficeTenantContext,
  input: {
    stageId: string;
    fallbackStageId?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ archivedStageId: string; migratedDemandsCount: number }> {
  assertPermission(ctx, 'workflow.write');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [stage] = await tx
        .select()
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            eq(workflowStages.id, input.stageId),
            isNull(workflowStages.archivedAt),
          ),
        )
        .limit(1);

      if (!stage) {
        throw new NotFoundError('Etapa não encontrada ou já arquivada.');
      }

      const remainingStages = await tx
        .select()
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            eq(workflowStages.workflowId, stage.workflowId),
            ne(workflowStages.id, stage.id),
            isNull(workflowStages.archivedAt),
          ),
        )
        .orderBy(asc(workflowStages.position));

      if (remainingStages.length === 0) {
        throw new ValidationError(
          'Não é possível arquivar a última etapa ativa do workflow. Toda esteira deve possuir ao menos uma etapa.',
        );
      }

      const [demandCountRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(demands)
        .where(and(eq(demands.organizationId, ctx.organizationId), eq(demands.stageId, stage.id)));

      const demandsInStage = demandCountRow?.count ?? 0;
      let migratedCount = 0;

      if (demandsInStage > 0) {
        if (!input.fallbackStageId) {
          throw new ConflictError(
            `Não é possível arquivar a etapa "${stage.name}" pois existem ${demandsInStage} demanda(s) posicionada(s) nela. Transicione as demandas ou informe uma etapa substituta.`,
          );
        }

        const fallback = remainingStages.find((s) => s.id === input.fallbackStageId);
        if (!fallback) {
          throw new ValidationError(
            'A etapa substituta informada não pertence a este workflow ou não está ativa.',
          );
        }

        await tx
          .update(demands)
          .set({
            stageId: fallback.id,
            statusCategory: fallback.category,
            completedAt: fallback.category === 'done' ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(
            and(eq(demands.organizationId, ctx.organizationId), eq(demands.stageId, stage.id)),
          );

        migratedCount = demandsInStage;
      }

      // Remove regras de transição que referenciam a etapa arquivada
      await tx
        .delete(workflowTransitions)
        .where(
          and(
            eq(workflowTransitions.organizationId, ctx.organizationId),
            eq(workflowTransitions.workflowId, stage.workflowId),
          ),
        );

      await tx
        .update(workflowStages)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(workflowStages.id, stage.id));

      // Renormaliza posições 1..N das etapas ativas remanescentes
      for (let i = 0; i < remainingStages.length; i++) {
        await tx
          .update(workflowStages)
          .set({ position: i + 1, updatedAt: new Date() })
          .where(eq(workflowStages.id, remainingStages[i]!.id));
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'workflow.stage_archived',
        entityType: 'workflow',
        entityId: stage.workflowId,
        changes: {
          archivedStageId: stage.id,
          archivedStageName: stage.name,
          fallbackStageId: input.fallbackStageId ?? null,
          migratedDemandsCount: migratedCount,
        },
      });

      return {
        archivedStageId: stage.id,
        migratedDemandsCount: migratedCount,
      };
    },
    database,
  );
}

/**
 * Configura as regras e bloqueios de transição de etapa (`workflow_transitions`) de um workflow:
 * - Quando `transitions` é vazio (`[]`), o workflow opera em modo livre (qualquer etapa ativa do workflow pode avançar/retornar para outra).
 * - Quando `transitions` contém pares `{ fromStageId, toStageId }`, apenas as transições expressamente listadas são permitidas em `transitionDemandStage`.
 */
export async function setWorkflowTransitionRules(
  ctx: OfficeTenantContext,
  input: {
    workflowId: string;
    transitions: Array<{ fromStageId: string; toStageId: string }>;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ workflowId: string; rulesCount: number }> {
  assertPermission(ctx, 'workflow.write');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [wf] = await tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.organizationId, ctx.organizationId),
            eq(workflows.id, input.workflowId),
            isNull(workflows.archivedAt),
          ),
        )
        .limit(1);

      if (!wf) {
        throw new NotFoundError('Workflow não encontrado nesta organização.');
      }

      const activeStages = await tx
        .select({ id: workflowStages.id })
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            eq(workflowStages.workflowId, wf.id),
            isNull(workflowStages.archivedAt),
          ),
        );

      const validStageIds = new Set(activeStages.map((s) => s.id));
      const uniquePairs = new Map<string, { fromStageId: string; toStageId: string }>();

      for (const pair of input.transitions) {
        if (pair.fromStageId === pair.toStageId) {
          continue;
        }
        if (!validStageIds.has(pair.fromStageId) || !validStageIds.has(pair.toStageId)) {
          throw new ValidationError(
            'Todas as etapas das regras de transição devem pertencer a este workflow e estar ativas.',
          );
        }
        uniquePairs.set(`${pair.fromStageId}->${pair.toStageId}`, {
          fromStageId: pair.fromStageId,
          toStageId: pair.toStageId,
        });
      }

      await tx
        .delete(workflowTransitions)
        .where(
          and(
            eq(workflowTransitions.organizationId, ctx.organizationId),
            eq(workflowTransitions.workflowId, wf.id),
          ),
        );

      for (const rule of uniquePairs.values()) {
        await tx.insert(workflowTransitions).values({
          organizationId: ctx.organizationId,
          workflowId: wf.id,
          fromStageId: rule.fromStageId,
          toStageId: rule.toStageId,
        });
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'workflow.transitions_updated',
        entityType: 'workflow',
        entityId: wf.id,
        changes: {
          rulesCount: uniquePairs.size,
          transitions: Array.from(uniquePairs.values()),
        },
      });

      return {
        workflowId: wf.id,
        rulesCount: uniquePairs.size,
      };
    },
    database,
  );
}

/**
 * Cria um novo Tipo de Serviço (`service_types`) associado a uma categoria e a uma esteira (`defaultWorkflowId`).
 */
export async function createServiceType(
  ctx: OfficeTenantContext,
  input: {
    categoryId?: string | null;
    newCategoryName?: string | null;
    name: string;
    description?: string | null;
    defaultDepartmentId?: string | null;
    defaultWorkflowId: string;
    defaultDueDays?: number | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; name: string; defaultWorkflowId: string }> {
  assertPermission(ctx, 'workflow.write');

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new ValidationError('O nome do tipo de serviço deve ter pelo menos 2 caracteres.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [wf] = await tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.organizationId, ctx.organizationId),
            eq(workflows.id, input.defaultWorkflowId),
            isNull(workflows.archivedAt),
          ),
        )
        .limit(1);

      if (!wf) {
        throw new NotFoundError('Workflow padrão selecionado não encontrado nesta organização.');
      }

      let resolvedCategoryId = input.categoryId || null;

      if (!resolvedCategoryId && input.newCategoryName?.trim()) {
        const [createdCat] = await tx
          .insert(serviceCategories)
          .values({
            organizationId: ctx.organizationId,
            name: input.newCategoryName.trim(),
            position: 10,
          })
          .returning();
        resolvedCategoryId = createdCat!.id;
      }

      if (!resolvedCategoryId) {
        const [firstCat] = await tx
          .select()
          .from(serviceCategories)
          .where(eq(serviceCategories.organizationId, ctx.organizationId))
          .orderBy(asc(serviceCategories.position))
          .limit(1);
        if (!firstCat) {
          throw new ValidationError('Selecione ou crie uma categoria de serviço.');
        }
        resolvedCategoryId = firstCat.id;
      }

      let createdSvc;
      try {
        const [row] = await tx
          .insert(serviceTypes)
          .values({
            organizationId: ctx.organizationId,
            categoryId: resolvedCategoryId,
            name: trimmedName,
            description: input.description?.trim() || null,
            defaultDepartmentId: input.defaultDepartmentId || null,
            defaultWorkflowId: wf.id,
            defaultDueDays: input.defaultDueDays ?? null,
            active: true,
          })
          .returning();
        createdSvc = row!;
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new ConflictError('Já existe um tipo de serviço com este nome nesta organização.');
        }
        throw err;
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'service_type.created',
        entityType: 'service_type',
        entityId: createdSvc.id,
        changes: {
          name: createdSvc.name,
          categoryId: createdSvc.categoryId,
          defaultWorkflowId: createdSvc.defaultWorkflowId,
          defaultDepartmentId: createdSvc.defaultDepartmentId,
        },
      });

      return {
        id: createdSvc.id,
        name: createdSvc.name,
        defaultWorkflowId: createdSvc.defaultWorkflowId,
      };
    },
    database,
  );
}

/**
 * Atualiza a esteira (`defaultWorkflowId`) e departamento padrão vinculados a um tipo de serviço.
 */
export async function updateServiceTypeWorkflow(
  ctx: OfficeTenantContext,
  input: {
    serviceTypeId: string;
    defaultWorkflowId: string;
    defaultDepartmentId?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; defaultWorkflowId: string }> {
  assertPermission(ctx, 'workflow.write');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existingSvc] = await tx
        .select()
        .from(serviceTypes)
        .where(
          and(
            eq(serviceTypes.organizationId, ctx.organizationId),
            eq(serviceTypes.id, input.serviceTypeId),
          ),
        )
        .limit(1);

      if (!existingSvc) {
        throw new NotFoundError('Tipo de serviço não encontrado nesta organização.');
      }

      const [wf] = await tx
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.organizationId, ctx.organizationId),
            eq(workflows.id, input.defaultWorkflowId),
            isNull(workflows.archivedAt),
          ),
        )
        .limit(1);

      if (!wf) {
        throw new NotFoundError('Workflow selecionado não encontrado ou arquivado.');
      }

      const [updated] = await tx
        .update(serviceTypes)
        .set({
          defaultWorkflowId: wf.id,
          defaultDepartmentId:
            input.defaultDepartmentId !== undefined
              ? input.defaultDepartmentId || null
              : existingSvc.defaultDepartmentId,
          updatedAt: new Date(),
        })
        .where(eq(serviceTypes.id, existingSvc.id))
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'service_type.workflow_updated',
        entityType: 'service_type',
        entityId: existingSvc.id,
        changes: {
          serviceTypeName: existingSvc.name,
          previousWorkflowId: existingSvc.defaultWorkflowId,
          newWorkflowId: updated!.defaultWorkflowId,
        },
      });

      return {
        id: updated!.id,
        defaultWorkflowId: updated!.defaultWorkflowId,
      };
    },
    database,
  );
}

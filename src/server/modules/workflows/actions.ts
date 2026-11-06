'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createOfficeAction } from '@/server/context/action';
import {
  archiveWorkflowStage,
  createServiceType,
  createWorkflow,
  createWorkflowStage,
  reorderWorkflowStages,
  setWorkflowTransitionRules,
  updateServiceTypeWorkflow,
  updateWorkflow,
  updateWorkflowStage,
} from './service';

const stageCategorySchema = z.enum(['backlog', 'active', 'waiting', 'done', 'cancelled']);

export const createWorkflowAction = createOfficeAction({
  name: 'workflows.create',
  permission: 'workflow.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    name: z.string().trim().min(2, 'O nome do workflow deve ter pelo menos 2 caracteres.').max(160),
    description: z.string().trim().max(500).optional().nullable(),
    isDefault: z.boolean().optional(),
    stages: z
      .array(
        z.object({
          name: z.string().trim().min(2, 'Informe o nome da etapa.').max(120),
          category: stageCategorySchema,
          clientVisible: z.boolean().optional(),
          clientLabel: z.string().trim().max(120).optional().nullable(),
        }),
      )
      .optional(),
  }),
  handler: async ({ ctx, input }) => {
    const created = await createWorkflow(ctx, {
      name: input.name,
      description: input.description,
      isDefault: input.isDefault,
      stages: input.stages,
    });

    revalidatePath(`/${ctx.orgSlug}/configuracoes/workflows`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return created;
  },
});

export const updateWorkflowAction = createOfficeAction({
  name: 'workflows.update',
  permission: 'workflow.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    workflowId: z.string().uuid('Workflow inválido.'),
    name: z.string().trim().min(2, 'O nome do workflow deve ter pelo menos 2 caracteres.').max(160),
    description: z.string().trim().max(500).optional().nullable(),
    isDefault: z.boolean().optional(),
  }),
  handler: async ({ ctx, input }) => {
    const updated = await updateWorkflow(ctx, {
      workflowId: input.workflowId,
      name: input.name,
      description: input.description,
      isDefault: input.isDefault,
    });

    revalidatePath(`/${ctx.orgSlug}/configuracoes/workflows`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return updated;
  },
});

export const createWorkflowStageAction = createOfficeAction({
  name: 'workflows.createStage',
  permission: 'workflow.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    workflowId: z.string().uuid('Workflow inválido.'),
    name: z.string().trim().min(2, 'O nome da etapa deve ter pelo menos 2 caracteres.').max(120),
    category: stageCategorySchema,
    asInitialStage: z.boolean().optional(),
    clientVisible: z.boolean().optional(),
    clientLabel: z.string().trim().max(120).optional().nullable(),
  }),
  handler: async ({ ctx, input }) => {
    const created = await createWorkflowStage(ctx, {
      workflowId: input.workflowId,
      name: input.name,
      category: input.category,
      asInitialStage: input.asInitialStage,
      clientVisible: input.clientVisible,
      clientLabel: input.clientLabel,
    });

    revalidatePath(`/${ctx.orgSlug}/configuracoes/workflows`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return created;
  },
});

export const updateWorkflowStageAction = createOfficeAction({
  name: 'workflows.updateStage',
  permission: 'workflow.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    stageId: z.string().uuid('Etapa inválida.'),
    name: z.string().trim().min(2, 'O nome da etapa deve ter pelo menos 2 caracteres.').max(120),
    category: stageCategorySchema,
    clientVisible: z.boolean().optional(),
    clientLabel: z.string().trim().max(120).optional().nullable(),
  }),
  handler: async ({ ctx, input }) => {
    const updated = await updateWorkflowStage(ctx, {
      stageId: input.stageId,
      name: input.name,
      category: input.category,
      clientVisible: input.clientVisible,
      clientLabel: input.clientLabel,
    });

    revalidatePath(`/${ctx.orgSlug}/configuracoes/workflows`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return updated;
  },
});

export const reorderWorkflowStagesAction = createOfficeAction({
  name: 'workflows.reorderStages',
  permission: 'workflow.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    workflowId: z.string().uuid('Workflow inválido.'),
    orderedStageIds: z.array(z.string().uuid()).min(1),
  }),
  handler: async ({ ctx, input }) => {
    const reordered = await reorderWorkflowStages(ctx, {
      workflowId: input.workflowId,
      orderedStageIds: input.orderedStageIds,
    });

    revalidatePath(`/${ctx.orgSlug}/configuracoes/workflows`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return reordered;
  },
});

export const archiveWorkflowStageAction = createOfficeAction({
  name: 'workflows.archiveStage',
  permission: 'workflow.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    stageId: z.string().uuid('Etapa inválida.'),
    fallbackStageId: z.string().uuid().optional().nullable(),
  }),
  handler: async ({ ctx, input }) => {
    const archived = await archiveWorkflowStage(ctx, {
      stageId: input.stageId,
      fallbackStageId: input.fallbackStageId,
    });

    revalidatePath(`/${ctx.orgSlug}/configuracoes/workflows`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return archived;
  },
});

export const setWorkflowTransitionRulesAction = createOfficeAction({
  name: 'workflows.setTransitionRules',
  permission: 'workflow.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    workflowId: z.string().uuid('Workflow inválido.'),
    transitions: z.array(
      z.object({
        fromStageId: z.string().uuid(),
        toStageId: z.string().uuid(),
      }),
    ),
  }),
  handler: async ({ ctx, input }) => {
    const updated = await setWorkflowTransitionRules(ctx, {
      workflowId: input.workflowId,
      transitions: input.transitions,
    });

    revalidatePath(`/${ctx.orgSlug}/configuracoes/workflows`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return updated;
  },
});

export const createServiceTypeAction = createOfficeAction({
  name: 'workflows.createServiceType',
  permission: 'workflow.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    categoryId: z.string().uuid().optional().nullable(),
    newCategoryName: z.string().trim().max(120).optional().nullable(),
    name: z
      .string()
      .trim()
      .min(2, 'O nome do tipo de serviço deve ter pelo menos 2 caracteres.')
      .max(160),
    description: z.string().trim().max(500).optional().nullable(),
    defaultDepartmentId: z.string().uuid().optional().nullable(),
    defaultWorkflowId: z.string().uuid('Selecione a esteira de atendimento.'),
    defaultDueDays: z.number().int().min(1).max(365).optional().nullable(),
  }),
  handler: async ({ ctx, input }) => {
    const created = await createServiceType(ctx, {
      categoryId: input.categoryId,
      newCategoryName: input.newCategoryName,
      name: input.name,
      description: input.description,
      defaultDepartmentId: input.defaultDepartmentId,
      defaultWorkflowId: input.defaultWorkflowId,
      defaultDueDays: input.defaultDueDays,
    });

    revalidatePath(`/${ctx.orgSlug}/configuracoes/workflows`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return created;
  },
});

export const updateServiceTypeWorkflowAction = createOfficeAction({
  name: 'workflows.updateServiceTypeWorkflow',
  permission: 'workflow.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    serviceTypeId: z.string().uuid('Tipo de serviço inválido.'),
    defaultWorkflowId: z.string().uuid('Selecione a esteira de atendimento.'),
    defaultDepartmentId: z.string().uuid().optional().nullable(),
  }),
  handler: async ({ ctx, input }) => {
    const updated = await updateServiceTypeWorkflow(ctx, {
      serviceTypeId: input.serviceTypeId,
      defaultWorkflowId: input.defaultWorkflowId,
      defaultDepartmentId: input.defaultDepartmentId,
    });

    revalidatePath(`/${ctx.orgSlug}/configuracoes/workflows`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return updated;
  },
});

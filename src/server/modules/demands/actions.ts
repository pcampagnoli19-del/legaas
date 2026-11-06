'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createOfficeAction } from '@/server/context/action';
import {
  addDemandComment,
  addDemandParticipant,
  createDemand,
  removeDemandParticipant,
  transitionDemandStage,
  updateDemand,
} from './service';

const demandPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
const participantRoleSchema = z.enum(['collaborator', 'watcher']);

export const createDemandAction = createOfficeAction({
  name: 'demands.create',
  schema: z.object({
    orgSlug: z.string().min(1),
    title: z
      .string()
      .trim()
      .min(3, 'O título da demanda deve ter pelo menos 3 caracteres.')
      .max(240),
    description: z.string().trim().max(4000).optional(),
    clientId: z.string().uuid('Selecione o cliente vinculado à demanda.'),
    companyId: z.string().uuid('Empresa inválida.').optional().nullable(),
    serviceTypeId: z.string().uuid('Tipo de serviço inválido.').optional().nullable(),
    workflowId: z.string().uuid('Esteira de workflow inválida.').optional().nullable(),
    stageId: z.string().uuid('Etapa de workflow inválida.').optional().nullable(),
    departmentId: z.string().uuid('Selecione o departamento responsável.'),
    assigneeMembershipId: z.string().uuid('Responsável inválido.').optional().nullable(),
    priority: demandPrioritySchema.optional(),
    dueDate: z.string().trim().max(20).optional().nullable(),
    participantMembershipIds: z.array(z.string().uuid()).optional(),
  }),
  handler: async ({ ctx, input }) => {
    const created = await createDemand(ctx, {
      title: input.title,
      description: input.description,
      clientId: input.clientId,
      companyId: input.companyId,
      serviceTypeId: input.serviceTypeId,
      workflowId: input.workflowId,
      stageId: input.stageId,
      departmentId: input.departmentId,
      assigneeMembershipId: input.assigneeMembershipId,
      priority: input.priority,
      dueDate: input.dueDate,
      participantMembershipIds: input.participantMembershipIds,
    });

    revalidatePath(`/${ctx.orgSlug}`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    return created;
  },
});

export const transitionDemandStageAction = createOfficeAction({
  name: 'demands.transitionStage',
  schema: z.object({
    orgSlug: z.string().min(1),
    demandId: z.string().uuid('Demanda inválida.'),
    toStageId: z.string().uuid('Selecione a etapa de destino.'),
    note: z.string().trim().max(1000).optional().nullable(),
  }),
  handler: async ({ ctx, input }) => {
    const transitioned = await transitionDemandStage(ctx, {
      demandId: input.demandId,
      toStageId: input.toStageId,
      note: input.note,
    });

    revalidatePath(`/${ctx.orgSlug}`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    revalidatePath(`/${ctx.orgSlug}/demandas/${input.demandId}`);
    return transitioned;
  },
});

export const updateDemandAction = createOfficeAction({
  name: 'demands.update',
  schema: z.object({
    orgSlug: z.string().min(1),
    demandId: z.string().uuid('Demanda inválida.'),
    title: z
      .string()
      .trim()
      .min(3, 'O título da demanda deve ter pelo menos 3 caracteres.')
      .max(240),
    description: z.string().trim().max(4000).optional().nullable(),
    clientId: z.string().uuid('Selecione o cliente vinculado à demanda.'),
    companyId: z.string().uuid('Empresa inválida.').optional().nullable(),
    departmentId: z.string().uuid('Selecione o departamento responsável.'),
    assigneeMembershipId: z.string().uuid('Responsável inválido.').optional().nullable(),
    priority: demandPrioritySchema,
    dueDate: z.string().trim().max(20).optional().nullable(),
  }),
  handler: async ({ ctx, input }) => {
    const updated = await updateDemand(ctx, {
      demandId: input.demandId,
      title: input.title,
      description: input.description,
      clientId: input.clientId,
      companyId: input.companyId,
      departmentId: input.departmentId,
      assigneeMembershipId: input.assigneeMembershipId,
      priority: input.priority,
      dueDate: input.dueDate,
    });

    revalidatePath(`/${ctx.orgSlug}`);
    revalidatePath(`/${ctx.orgSlug}/demandas`);
    revalidatePath(`/${ctx.orgSlug}/demandas/${input.demandId}`);
    return updated;
  },
});

export const addDemandParticipantAction = createOfficeAction({
  name: 'demands.addParticipant',
  schema: z.object({
    orgSlug: z.string().min(1),
    demandId: z.string().uuid('Demanda inválida.'),
    membershipId: z.string().uuid('Selecione um colaborador válido.'),
    role: participantRoleSchema.optional(),
  }),
  handler: async ({ ctx, input }) => {
    const result = await addDemandParticipant(ctx, {
      demandId: input.demandId,
      membershipId: input.membershipId,
      role: input.role,
    });

    revalidatePath(`/${ctx.orgSlug}/demandas/${input.demandId}`);
    return result;
  },
});

export const removeDemandParticipantAction = createOfficeAction({
  name: 'demands.removeParticipant',
  schema: z.object({
    orgSlug: z.string().min(1),
    demandId: z.string().uuid('Demanda inválida.'),
    membershipId: z.string().uuid('Colaborador inválido.'),
  }),
  handler: async ({ ctx, input }) => {
    await removeDemandParticipant(ctx, {
      demandId: input.demandId,
      membershipId: input.membershipId,
    });

    revalidatePath(`/${ctx.orgSlug}/demandas/${input.demandId}`);
    return { removed: true };
  },
});

export const addDemandCommentAction = createOfficeAction({
  name: 'demands.addComment',
  schema: z.object({
    orgSlug: z.string().min(1),
    demandId: z.string().uuid('Demanda inválida.'),
    body: z.string().trim().min(2, 'O comentário deve conter ao menos 2 caracteres.').max(4000),
  }),
  handler: async ({ ctx, input }) => {
    const created = await addDemandComment(ctx, {
      demandId: input.demandId,
      body: input.body,
    });

    revalidatePath(`/${ctx.orgSlug}/demandas/${input.demandId}`);
    return created;
  },
});

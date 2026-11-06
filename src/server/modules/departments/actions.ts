'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createOfficeAction } from '@/server/context/action';
import {
  assignMemberToDepartment,
  createDepartment,
  removeMemberFromDepartment,
  updateDepartment,
} from './service';

const deptRoleSchema = z.enum(['member', 'coordinator', 'manager']);

export const createDepartmentAction = createOfficeAction({
  name: 'departments.create',
  permission: 'department.create',
  schema: z.object({
    orgSlug: z.string().min(1),
    name: z
      .string()
      .trim()
      .min(2, 'O nome do departamento deve ter no mínimo 2 caracteres.')
      .max(80, 'O nome do departamento deve ter no máximo 80 caracteres.'),
    description: z.string().trim().max(300).optional(),
  }),
  handler: async ({ ctx, input }) => {
    const created = await createDepartment(ctx, {
      name: input.name,
      description: input.description,
    });

    revalidatePath(`/${ctx.orgSlug}/departamentos`);
    revalidatePath(`/${ctx.orgSlug}/usuarios`);
    return created;
  },
});

export const updateDepartmentAction = createOfficeAction({
  name: 'departments.update',
  permission: 'department.update',
  schema: z.object({
    orgSlug: z.string().min(1),
    departmentId: z.string().uuid('Departamento inválido.'),
    name: z
      .string()
      .trim()
      .min(2, 'O nome do departamento deve ter no mínimo 2 caracteres.')
      .max(80, 'O nome do departamento deve ter no máximo 80 caracteres.'),
    description: z.string().trim().max(300).optional(),
  }),
  handler: async ({ ctx, input }) => {
    const updated = await updateDepartment(ctx, {
      departmentId: input.departmentId,
      name: input.name,
      description: input.description,
    });

    revalidatePath(`/${ctx.orgSlug}/departamentos`);
    revalidatePath(`/${ctx.orgSlug}/usuarios`);
    return updated;
  },
});

export const assignDepartmentMemberAction = createOfficeAction({
  name: 'departments.assignMember',
  permission: 'department.assign_member',
  schema: z.object({
    orgSlug: z.string().min(1),
    departmentId: z.string().uuid('Departamento inválido.'),
    membershipId: z.string().uuid('Membro inválido.'),
    departmentRole: deptRoleSchema,
  }),
  handler: async ({ ctx, input }) => {
    const assigned = await assignMemberToDepartment(ctx, {
      departmentId: input.departmentId,
      membershipId: input.membershipId,
      departmentRole: input.departmentRole,
    });

    revalidatePath(`/${ctx.orgSlug}/departamentos`);
    revalidatePath(`/${ctx.orgSlug}/usuarios`);
    return assigned;
  },
});

export const removeDepartmentMemberAction = createOfficeAction({
  name: 'departments.removeMember',
  permission: 'department.assign_member',
  schema: z.object({
    orgSlug: z.string().min(1),
    departmentId: z.string().uuid('Departamento inválido.'),
    membershipId: z.string().uuid('Membro inválido.'),
  }),
  handler: async ({ ctx, input }) => {
    await removeMemberFromDepartment(ctx, {
      departmentId: input.departmentId,
      membershipId: input.membershipId,
    });

    revalidatePath(`/${ctx.orgSlug}/departamentos`);
    revalidatePath(`/${ctx.orgSlug}/usuarios`);
    return { removed: true };
  },
});

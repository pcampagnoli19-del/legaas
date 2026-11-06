'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createOfficeAction } from '@/server/context/action';
import {
  inviteOrganizationMember,
  revokeOrganizationInvitation,
  setOrganizationMemberStatus,
  updateOrganizationMemberRole,
} from './service';

const internalRoleSchema = z.enum(['org_admin', 'manager', 'coordinator', 'analyst', 'viewer']);

export const inviteMemberAction = createOfficeAction({
  name: 'members.invite',
  permission: 'member.invite',
  schema: z.object({
    orgSlug: z.string().min(1),
    email: z.string().trim().email('Informe um endereço de e-mail válido.'),
    role: internalRoleSchema,
  }),
  handler: async ({ ctx, input }) => {
    const invited = await inviteOrganizationMember(ctx, {
      email: input.email,
      role: input.role,
    });

    revalidatePath(`/${ctx.orgSlug}/usuarios`);

    return {
      invitationId: invited.invitationId,
      email: invited.email,
      role: invited.role,
      invitePath: `/convite/${invited.rawInviteToken}`,
      expiresAt: invited.expiresAt.toISOString(),
    };
  },
});

export const updateMemberRoleAction = createOfficeAction({
  name: 'members.updateRole',
  permission: 'member.update_role',
  schema: z.object({
    orgSlug: z.string().min(1),
    targetMembershipId: z.string().uuid('Identificador de membro inválido.'),
    newRole: internalRoleSchema,
  }),
  handler: async ({ ctx, input }) => {
    const updated = await updateOrganizationMemberRole(ctx, {
      targetMembershipId: input.targetMembershipId,
      newRole: input.newRole,
    });

    revalidatePath(`/${ctx.orgSlug}/usuarios`);
    return updated;
  },
});

export const setMemberStatusAction = createOfficeAction({
  name: 'members.setStatus',
  permission: 'member.deactivate',
  schema: z.object({
    orgSlug: z.string().min(1),
    targetMembershipId: z.string().uuid('Identificador de membro inválido.'),
    status: z.enum(['active', 'disabled']),
  }),
  handler: async ({ ctx, input }) => {
    const updated = await setOrganizationMemberStatus(ctx, {
      targetMembershipId: input.targetMembershipId,
      status: input.status,
    });

    revalidatePath(`/${ctx.orgSlug}/usuarios`);
    return updated;
  },
});

export const revokeInvitationAction = createOfficeAction({
  name: 'members.revokeInvitation',
  permission: 'member.invite',
  schema: z.object({
    orgSlug: z.string().min(1),
    invitationId: z.string().uuid('Identificador de convite inválido.'),
  }),
  handler: async ({ ctx, input }) => {
    const revoked = await revokeOrganizationInvitation(ctx, {
      invitationId: input.invitationId,
    });

    revalidatePath(`/${ctx.orgSlug}/usuarios`);
    return revoked;
  },
});

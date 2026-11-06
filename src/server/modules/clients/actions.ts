'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createOfficeAction } from '@/server/context/action';
import {
  createClient,
  createClientContact,
  removeClientContact,
  setClientStatus,
  updateClient,
} from './service';

const clientTypeSchema = z.enum(['individual', 'organization']);
const entityStatusSchema = z.enum(['active', 'inactive']);

export const createClientAction = createOfficeAction({
  name: 'clients.create',
  permission: 'client.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    type: clientTypeSchema,
    name: z.string().trim().min(2, 'Informe o nome ou razão social do cliente.').max(160),
    taxId: z.string().trim().max(24).optional(),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(1000).optional(),
    ownerMembershipId: z.string().uuid().optional(),
    contactName: z.string().trim().max(120).optional(),
    contactEmail: z.string().trim().max(160).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    contactPosition: z.string().trim().max(80).optional(),
  }),
  handler: async ({ ctx, input }) => {
    const created = await createClient(ctx, {
      type: input.type,
      name: input.name,
      taxId: input.taxId,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      ownerMembershipId: input.ownerMembershipId,
      primaryContact:
        input.contactName && input.contactName.trim().length > 0
          ? {
              name: input.contactName,
              email: input.contactEmail,
              phone: input.contactPhone,
              position: input.contactPosition,
            }
          : null,
    });

    revalidatePath(`/${ctx.orgSlug}/clientes`);
    revalidatePath(`/${ctx.orgSlug}/empresas`);
    return created;
  },
});

export const updateClientAction = createOfficeAction({
  name: 'clients.update',
  permission: 'client.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    clientId: z.string().uuid('Cliente inválido.'),
    type: clientTypeSchema,
    name: z.string().trim().min(2, 'Informe o nome ou razão social do cliente.').max(160),
    taxId: z.string().trim().max(24).optional(),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(1000).optional(),
    ownerMembershipId: z.string().uuid().optional(),
  }),
  handler: async ({ ctx, input }) => {
    const updated = await updateClient(ctx, {
      clientId: input.clientId,
      type: input.type,
      name: input.name,
      taxId: input.taxId,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      ownerMembershipId: input.ownerMembershipId,
    });

    revalidatePath(`/${ctx.orgSlug}/clientes`);
    revalidatePath(`/${ctx.orgSlug}/empresas`);
    return updated;
  },
});

export const setClientStatusAction = createOfficeAction({
  name: 'clients.setStatus',
  permission: 'client.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    clientId: z.string().uuid('Cliente inválido.'),
    status: entityStatusSchema,
  }),
  handler: async ({ ctx, input }) => {
    const updated = await setClientStatus(ctx, {
      clientId: input.clientId,
      status: input.status,
    });

    revalidatePath(`/${ctx.orgSlug}/clientes`);
    revalidatePath(`/${ctx.orgSlug}/empresas`);
    return updated;
  },
});

export const createClientContactAction = createOfficeAction({
  name: 'clients.createContact',
  permission: 'client.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    clientId: z.string().uuid('Cliente inválido.'),
    name: z.string().trim().min(2, 'Informe o nome do contato.').max(120),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    position: z.string().trim().max(80).optional(),
    isPrimary: z.boolean().optional(),
  }),
  handler: async ({ ctx, input }) => {
    const contact = await createClientContact(ctx, {
      clientId: input.clientId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      position: input.position,
      isPrimary: input.isPrimary,
    });

    revalidatePath(`/${ctx.orgSlug}/clientes`);
    return {
      ...contact,
      createdAt: contact.createdAt.toISOString(),
    };
  },
});

export const removeClientContactAction = createOfficeAction({
  name: 'clients.removeContact',
  permission: 'client.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    contactId: z.string().uuid('Contato inválido.'),
  }),
  handler: async ({ ctx, input }) => {
    const removed = await removeClientContact(ctx, {
      contactId: input.contactId,
    });

    revalidatePath(`/${ctx.orgSlug}/clientes`);
    return removed;
  },
});

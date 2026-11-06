import 'server-only';
import { and, asc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { assertPermission } from '@/server/authz/permissions';
import type { OfficeTenantContext } from '@/server/context/tenant-context';
import { getDb } from '@/server/db/client';
import {
  activityLog,
  clientContacts,
  clients,
  companies,
  memberships,
  users,
} from '@/server/db/schema';
import { type AnyPgDatabase, withTenant } from '@/server/db/tenant';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app-error';

export type ClientType = 'individual' | 'organization';
export type EntityStatus = 'active' | 'inactive';

export interface ClientContactDTO {
  id: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  isPrimary: boolean;
  createdAt: Date;
}

export interface ClientDTO {
  id: string;
  type: ClientType;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  status: EntityStatus;
  notes: string | null;
  ownerMembershipId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  contacts: ClientContactDTO[];
  companyCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListClientsFilter {
  search?: string;
  status?: EntityStatus;
  type?: ClientType;
}

/**
 * Normaliza CPF (11 dígitos) ou CNPJ (14 dígitos) removendo pontuação.
 */
export function normalizeClientTaxId(
  rawTaxId: string | null | undefined,
  clientType: ClientType,
): string | null {
  if (!rawTaxId || rawTaxId.trim() === '') {
    return null;
  }

  const digits = rawTaxId.replace(/\D/g, '');
  if (clientType === 'individual' && digits.length !== 11) {
    throw new ValidationError('O CPF do cliente pessoa física deve conter 11 dígitos numéricos.');
  }
  if (clientType === 'organization' && digits.length !== 14) {
    throw new ValidationError(
      'O CNPJ do cliente pessoa jurídica deve conter 14 dígitos numéricos.',
    );
  }
  return digits;
}

/**
 * Lista os clientes da organização ativa com filtros de pesquisa, status e tipo,
 * incluindo contatos cadastrados, responsável interno e quantidade de empresas vinculadas.
 */
export async function listOrganizationClients(
  ctx: OfficeTenantContext,
  filters: ListClientsFilter = {},
  database: AnyPgDatabase = getDb(),
): Promise<ClientDTO[]> {
  assertPermission(ctx, 'client.read');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const conditions = [
        eq(clients.organizationId, ctx.organizationId),
        isNull(clients.archivedAt),
      ];

      if (filters.status) {
        conditions.push(eq(clients.status, filters.status));
      }

      if (filters.type) {
        conditions.push(eq(clients.type, filters.type));
      }

      const trimmedSearch = filters.search?.trim();
      if (trimmedSearch) {
        const digitsOnly = trimmedSearch.replace(/\D/g, '');
        const searchConditions = [
          ilike(clients.name, `%${trimmedSearch}%`),
          ilike(clients.email, `%${trimmedSearch}%`),
        ];
        if (digitsOnly.length > 0) {
          searchConditions.push(ilike(clients.taxId, `%${digitsOnly}%`));
        } else {
          searchConditions.push(ilike(clients.taxId, `%${trimmedSearch}%`));
        }
        conditions.push(or(...searchConditions)!);
      }

      const rows = await tx
        .select({
          id: clients.id,
          type: clients.type,
          name: clients.name,
          taxId: clients.taxId,
          email: clients.email,
          phone: clients.phone,
          status: clients.status,
          notes: clients.notes,
          ownerMembershipId: clients.ownerMembershipId,
          ownerName: users.name,
          ownerEmail: users.email,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt,
        })
        .from(clients)
        .leftJoin(
          memberships,
          and(
            eq(memberships.organizationId, clients.organizationId),
            eq(memberships.id, clients.ownerMembershipId),
          ),
        )
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(...conditions))
        .orderBy(asc(clients.name));

      const contactRows = await tx
        .select()
        .from(clientContacts)
        .where(eq(clientContacts.organizationId, ctx.organizationId))
        .orderBy(asc(clientContacts.name));

      const companyCountRows = await tx
        .select({
          clientId: companies.clientId,
          count: sql<number>`count(*)::int`,
        })
        .from(companies)
        .where(and(eq(companies.organizationId, ctx.organizationId), isNull(companies.archivedAt)))
        .groupBy(companies.clientId);

      const contactsByClient = new Map<string, ClientContactDTO[]>();
      for (const c of contactRows) {
        const list = contactsByClient.get(c.clientId) ?? [];
        list.push({
          id: c.id,
          clientId: c.clientId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          position: c.position,
          isPrimary: c.isPrimary,
          createdAt: c.createdAt,
        });
        contactsByClient.set(c.clientId, list);
      }

      const companyCountByClient = new Map<string, number>();
      for (const row of companyCountRows) {
        companyCountByClient.set(row.clientId, Number(row.count));
      }

      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        taxId: row.taxId,
        email: row.email,
        phone: row.phone,
        status: row.status,
        notes: row.notes,
        ownerMembershipId: row.ownerMembershipId,
        ownerName: row.ownerName ?? null,
        ownerEmail: row.ownerEmail ?? null,
        contacts: contactsByClient.get(row.id) ?? [],
        companyCount: companyCountByClient.get(row.id) ?? 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    },
    database,
  );
}

/**
 * Cadastra um novo cliente (PF ou PJ) na organização ativa, com validação de unicidade de
 * CPF/CNPJ por tenant, associação de responsável interno e criação opcional de contato principal.
 */
export async function createClient(
  ctx: OfficeTenantContext,
  input: {
    type: ClientType;
    name: string;
    taxId?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    ownerMembershipId?: string | null;
    primaryContact?: {
      name: string;
      email?: string | null;
      phone?: string | null;
      position?: string | null;
    } | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; name: string; taxId: string | null }> {
  assertPermission(ctx, 'client.write');

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new ValidationError('O nome do cliente deve ter pelo menos 2 caracteres.');
  }

  const normalizedTaxId = normalizeClientTaxId(input.taxId, input.type);

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      if (normalizedTaxId) {
        const existingTaxId = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(
            and(
              eq(clients.organizationId, ctx.organizationId),
              eq(clients.taxId, normalizedTaxId),
              isNull(clients.archivedAt),
            ),
          )
          .limit(1);

        if (existingTaxId.length > 0) {
          throw new ConflictError(
            `Já existe um cliente cadastrado com o documento "${normalizedTaxId}" nesta organização.`,
          );
        }
      }

      if (input.ownerMembershipId) {
        const [owner] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.organizationId, ctx.organizationId),
              eq(memberships.id, input.ownerMembershipId),
              eq(memberships.kind, 'internal'),
            ),
          )
          .limit(1);

        if (!owner) {
          throw new NotFoundError('Responsável interno não encontrado nesta organização.');
        }
      }

      const [created] = await tx
        .insert(clients)
        .values({
          organizationId: ctx.organizationId,
          type: input.type,
          name: trimmedName,
          taxId: normalizedTaxId,
          email: input.email?.trim().toLowerCase() || null,
          phone: input.phone?.trim() || null,
          notes: input.notes?.trim() || null,
          ownerMembershipId: input.ownerMembershipId || null,
          status: 'active',
        })
        .returning();

      if (input.primaryContact && input.primaryContact.name.trim().length > 0) {
        await tx.insert(clientContacts).values({
          organizationId: ctx.organizationId,
          clientId: created!.id,
          name: input.primaryContact.name.trim(),
          email: input.primaryContact.email?.trim().toLowerCase() || null,
          phone: input.primaryContact.phone?.trim() || null,
          position: input.primaryContact.position?.trim() || null,
          isPrimary: true,
        });
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'client.created',
        entityType: 'client',
        entityId: created!.id,
        changes: {
          type: created!.type,
          name: created!.name,
          taxId: created!.taxId,
          ownerMembershipId: created!.ownerMembershipId,
        },
      });

      return {
        id: created!.id,
        name: created!.name,
        taxId: created!.taxId,
      };
    },
    database,
  );
}

/**
 * Atualiza os dados cadastrais e o responsável interno de um cliente existente.
 */
export async function updateClient(
  ctx: OfficeTenantContext,
  input: {
    clientId: string;
    type: ClientType;
    name: string;
    taxId?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    ownerMembershipId?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; name: string; taxId: string | null }> {
  assertPermission(ctx, 'client.write');

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new ValidationError('O nome do cliente deve ter pelo menos 2 caracteres.');
  }

  const normalizedTaxId = normalizeClientTaxId(input.taxId, input.type);

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, ctx.organizationId),
            eq(clients.id, input.clientId),
            isNull(clients.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Cliente não encontrado nesta organização.');
      }

      if (normalizedTaxId) {
        const duplicate = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(
            and(
              eq(clients.organizationId, ctx.organizationId),
              eq(clients.taxId, normalizedTaxId),
              ne(clients.id, existing.id),
              isNull(clients.archivedAt),
            ),
          )
          .limit(1);

        if (duplicate.length > 0) {
          throw new ConflictError(
            `Já existe outro cliente cadastrado com o documento "${normalizedTaxId}" nesta organização.`,
          );
        }
      }

      if (input.ownerMembershipId) {
        const [owner] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.organizationId, ctx.organizationId),
              eq(memberships.id, input.ownerMembershipId),
              eq(memberships.kind, 'internal'),
            ),
          )
          .limit(1);

        if (!owner) {
          throw new NotFoundError('Responsável interno não encontrado nesta organização.');
        }
      }

      const [updated] = await tx
        .update(clients)
        .set({
          type: input.type,
          name: trimmedName,
          taxId: normalizedTaxId,
          email: input.email?.trim().toLowerCase() || null,
          phone: input.phone?.trim() || null,
          notes: input.notes?.trim() || null,
          ownerMembershipId: input.ownerMembershipId || null,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, existing.id))
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'client.updated',
        entityType: 'client',
        entityId: existing.id,
        changes: {
          previousName: existing.name,
          newName: updated!.name,
          previousTaxId: existing.taxId,
          newTaxId: updated!.taxId,
        },
      });

      return {
        id: updated!.id,
        name: updated!.name,
        taxId: updated!.taxId,
      };
    },
    database,
  );
}

/**
 * Ativa ou desativa um cliente na organização.
 */
export async function setClientStatus(
  ctx: OfficeTenantContext,
  input: {
    clientId: string;
    status: EntityStatus;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; status: EntityStatus }> {
  assertPermission(ctx, 'client.write');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, ctx.organizationId),
            eq(clients.id, input.clientId),
            isNull(clients.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Cliente não encontrado nesta organização.');
      }

      const [updated] = await tx
        .update(clients)
        .set({
          status: input.status,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, existing.id))
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'client.status_changed',
        entityType: 'client',
        entityId: existing.id,
        changes: {
          previousStatus: existing.status,
          newStatus: input.status,
        },
      });

      return {
        id: updated!.id,
        status: updated!.status,
      };
    },
    database,
  );
}

/**
 * Adiciona um contato vinculado a um cliente da organização.
 */
export async function createClientContact(
  ctx: OfficeTenantContext,
  input: {
    clientId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    position?: string | null;
    isPrimary?: boolean;
  },
  database: AnyPgDatabase = getDb(),
): Promise<ClientContactDTO> {
  assertPermission(ctx, 'client.write');

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new ValidationError('O nome do contato deve ter pelo menos 2 caracteres.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [clientRow] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, ctx.organizationId),
            eq(clients.id, input.clientId),
            isNull(clients.archivedAt),
          ),
        )
        .limit(1);

      if (!clientRow) {
        throw new NotFoundError('Cliente não encontrado nesta organização.');
      }

      if (input.isPrimary) {
        await tx
          .update(clientContacts)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(
            and(
              eq(clientContacts.organizationId, ctx.organizationId),
              eq(clientContacts.clientId, input.clientId),
            ),
          );
      }

      const [created] = await tx
        .insert(clientContacts)
        .values({
          organizationId: ctx.organizationId,
          clientId: input.clientId,
          name: trimmedName,
          email: input.email?.trim().toLowerCase() || null,
          phone: input.phone?.trim() || null,
          position: input.position?.trim() || null,
          isPrimary: Boolean(input.isPrimary),
        })
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'client_contact.created',
        entityType: 'client_contact',
        entityId: created!.id,
        changes: {
          clientId: input.clientId,
          name: created!.name,
          isPrimary: created!.isPrimary,
        },
      });

      return {
        id: created!.id,
        clientId: created!.clientId,
        name: created!.name,
        email: created!.email,
        phone: created!.phone,
        position: created!.position,
        isPrimary: created!.isPrimary,
        createdAt: created!.createdAt,
      };
    },
    database,
  );
}

/**
 * Remove um contato vinculado a um cliente da organização.
 */
export async function removeClientContact(
  ctx: OfficeTenantContext,
  input: {
    contactId: string;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string }> {
  assertPermission(ctx, 'client.write');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(clientContacts)
        .where(
          and(
            eq(clientContacts.organizationId, ctx.organizationId),
            eq(clientContacts.id, input.contactId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Contato não encontrado nesta organização.');
      }

      await tx.delete(clientContacts).where(eq(clientContacts.id, existing.id));

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'client_contact.removed',
        entityType: 'client_contact',
        entityId: existing.id,
        changes: {
          clientId: existing.clientId,
          name: existing.name,
        },
      });

      return { id: existing.id };
    },
    database,
  );
}

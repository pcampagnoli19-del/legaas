import 'server-only';
import { and, asc, eq, ilike, isNull, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { assertPermission } from '@/server/authz/permissions';
import type { OfficeTenantContext } from '@/server/context/tenant-context';
import { getDb } from '@/server/db/client';
import { activityLog, clients, companies } from '@/server/db/schema';
import { type AnyPgDatabase, withTenant } from '@/server/db/tenant';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app-error';
import type { EntityStatus } from '@/server/modules/clients/service';

export interface CompanyDTO {
  id: string;
  clientId: string;
  clientName: string;
  parentCompanyId: string | null;
  parentCompanyName: string | null;
  parentCompanyCnpj: string | null;
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZipCode: string | null;
  status: EntityStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListCompaniesFilter {
  search?: string;
  clientId?: string;
  status?: EntityStatus;
}

/**
 * Normaliza o CNPJ removendo pontuação e validando que possui exatamente 14 dígitos numéricos.
 */
export function normalizeCnpj(rawCnpj: string): string {
  const digits = rawCnpj.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) {
    throw new ValidationError('Informe um CNPJ válido com 14 dígitos numéricos.');
  }
  return digits;
}

/**
 * Formata um CNPJ de 14 dígitos no padrão `00.000.000/0000-00`.
 */
export function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) {
    return cnpj;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/**
 * Lista as empresas (pessoas jurídicas) da organização ativa com filtros de pesquisa,
 * cliente e status, incluindo dados do cliente vinculado e da empresa-mãe (`parent_company_id`).
 */
export async function listOrganizationCompanies(
  ctx: OfficeTenantContext,
  filters: ListCompaniesFilter = {},
  database: AnyPgDatabase = getDb(),
): Promise<CompanyDTO[]> {
  assertPermission(ctx, 'company.read');

  const parentCompanies = alias(companies, 'parent_companies');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const conditions = [
        eq(companies.organizationId, ctx.organizationId),
        isNull(companies.archivedAt),
      ];

      if (filters.clientId) {
        conditions.push(eq(companies.clientId, filters.clientId));
      }

      if (filters.status) {
        conditions.push(eq(companies.status, filters.status));
      }

      const trimmedSearch = filters.search?.trim();
      if (trimmedSearch) {
        const digitsOnly = trimmedSearch.replace(/\D/g, '');
        const searchConditions = [
          ilike(companies.legalName, `%${trimmedSearch}%`),
          ilike(companies.tradeName, `%${trimmedSearch}%`),
          ilike(clients.name, `%${trimmedSearch}%`),
        ];
        if (digitsOnly.length > 0) {
          searchConditions.push(ilike(companies.cnpj, `%${digitsOnly}%`));
        } else {
          searchConditions.push(ilike(companies.cnpj, `%${trimmedSearch}%`));
        }
        conditions.push(or(...searchConditions)!);
      }

      const rows = await tx
        .select({
          id: companies.id,
          clientId: companies.clientId,
          clientName: clients.name,
          parentCompanyId: companies.parentCompanyId,
          parentCompanyName: parentCompanies.legalName,
          parentCompanyCnpj: parentCompanies.cnpj,
          cnpj: companies.cnpj,
          legalName: companies.legalName,
          tradeName: companies.tradeName,
          stateRegistration: companies.stateRegistration,
          municipalRegistration: companies.municipalRegistration,
          addressStreet: companies.addressStreet,
          addressNumber: companies.addressNumber,
          addressComplement: companies.addressComplement,
          addressDistrict: companies.addressDistrict,
          addressCity: companies.addressCity,
          addressState: companies.addressState,
          addressZipCode: companies.addressZipCode,
          status: companies.status,
          createdAt: companies.createdAt,
          updatedAt: companies.updatedAt,
        })
        .from(companies)
        .innerJoin(
          clients,
          and(
            eq(clients.organizationId, companies.organizationId),
            eq(clients.id, companies.clientId),
          ),
        )
        .leftJoin(
          parentCompanies,
          and(
            eq(parentCompanies.organizationId, companies.organizationId),
            eq(parentCompanies.id, companies.parentCompanyId),
          ),
        )
        .where(and(...conditions))
        .orderBy(asc(companies.legalName));

      return rows.map((row) => ({
        id: row.id,
        clientId: row.clientId,
        clientName: row.clientName,
        parentCompanyId: row.parentCompanyId,
        parentCompanyName: row.parentCompanyName ?? null,
        parentCompanyCnpj: row.parentCompanyCnpj ?? null,
        cnpj: row.cnpj,
        legalName: row.legalName,
        tradeName: row.tradeName,
        stateRegistration: row.stateRegistration,
        municipalRegistration: row.municipalRegistration,
        addressStreet: row.addressStreet,
        addressNumber: row.addressNumber,
        addressComplement: row.addressComplement,
        addressDistrict: row.addressDistrict,
        addressCity: row.addressCity,
        addressState: row.addressState,
        addressZipCode: row.addressZipCode,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    },
    database,
  );
}

/**
 * Cadastra uma nova empresa vinculada a um cliente da organização (Decisão A2),
 * suportando grupos empresariais via `parentCompanyId` e unicidade de CNPJ por tenant.
 */
export async function createCompany(
  ctx: OfficeTenantContext,
  input: {
    clientId: string;
    parentCompanyId?: string | null;
    cnpj: string;
    legalName: string;
    tradeName?: string | null;
    stateRegistration?: string | null;
    municipalRegistration?: string | null;
    addressStreet?: string | null;
    addressNumber?: string | null;
    addressComplement?: string | null;
    addressDistrict?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressZipCode?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; cnpj: string; legalName: string; clientId: string }> {
  assertPermission(ctx, 'company.write');

  const trimmedLegalName = input.legalName.trim();
  if (trimmedLegalName.length < 2) {
    throw new ValidationError('A razão social da empresa deve ter pelo menos 2 caracteres.');
  }

  const normalizedCnpj = normalizeCnpj(input.cnpj);

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      // Valida que o cliente pertence à organização ativa (FK composta Decisão A2)
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
        throw new NotFoundError('Cliente vinculado não encontrado nesta organização.');
      }

      // Valida unicidade do CNPJ dentro da organização ativa
      const existingCnpj = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(eq(companies.organizationId, ctx.organizationId), eq(companies.cnpj, normalizedCnpj)),
        )
        .limit(1);

      if (existingCnpj.length > 0) {
        throw new ConflictError(
          `Já existe uma empresa cadastrada com o CNPJ ${formatCnpj(normalizedCnpj)} nesta organização.`,
        );
      }

      if (input.parentCompanyId) {
        const [parentRow] = await tx
          .select({ id: companies.id })
          .from(companies)
          .where(
            and(
              eq(companies.organizationId, ctx.organizationId),
              eq(companies.id, input.parentCompanyId),
              isNull(companies.archivedAt),
            ),
          )
          .limit(1);

        if (!parentRow) {
          throw new NotFoundError('Empresa-mãe (holding) não encontrada nesta organização.');
        }
      }

      const [created] = await tx
        .insert(companies)
        .values({
          organizationId: ctx.organizationId,
          clientId: input.clientId,
          parentCompanyId: input.parentCompanyId || null,
          cnpj: normalizedCnpj,
          legalName: trimmedLegalName,
          tradeName: input.tradeName?.trim() || null,
          stateRegistration: input.stateRegistration?.trim() || null,
          municipalRegistration: input.municipalRegistration?.trim() || null,
          addressStreet: input.addressStreet?.trim() || null,
          addressNumber: input.addressNumber?.trim() || null,
          addressComplement: input.addressComplement?.trim() || null,
          addressDistrict: input.addressDistrict?.trim() || null,
          addressCity: input.addressCity?.trim() || null,
          addressState: input.addressState?.trim().toUpperCase() || null,
          addressZipCode: input.addressZipCode?.replace(/\D/g, '') || null,
          status: 'active',
        })
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'company.created',
        entityType: 'company',
        entityId: created!.id,
        changes: {
          clientId: created!.clientId,
          parentCompanyId: created!.parentCompanyId,
          cnpj: created!.cnpj,
          legalName: created!.legalName,
        },
      });

      return {
        id: created!.id,
        cnpj: created!.cnpj,
        legalName: created!.legalName,
        clientId: created!.clientId,
      };
    },
    database,
  );
}

/**
 * Atualiza os dados cadastrais, endereço, vínculo de cliente e holding (`parentCompanyId`)
 * de uma empresa existente.
 */
export async function updateCompany(
  ctx: OfficeTenantContext,
  input: {
    companyId: string;
    clientId: string;
    parentCompanyId?: string | null;
    cnpj: string;
    legalName: string;
    tradeName?: string | null;
    stateRegistration?: string | null;
    municipalRegistration?: string | null;
    addressStreet?: string | null;
    addressNumber?: string | null;
    addressComplement?: string | null;
    addressDistrict?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressZipCode?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; cnpj: string; legalName: string; clientId: string }> {
  assertPermission(ctx, 'company.write');

  const trimmedLegalName = input.legalName.trim();
  if (trimmedLegalName.length < 2) {
    throw new ValidationError('A razão social da empresa deve ter pelo menos 2 caracteres.');
  }

  if (input.parentCompanyId && input.parentCompanyId === input.companyId) {
    throw new ValidationError('Uma empresa não pode ser definida como holding de si mesma.');
  }

  const normalizedCnpj = normalizeCnpj(input.cnpj);

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.organizationId, ctx.organizationId),
            eq(companies.id, input.companyId),
            isNull(companies.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Empresa não encontrada nesta organização.');
      }

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
        throw new NotFoundError('Cliente vinculado não encontrado nesta organização.');
      }

      const duplicateCnpj = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.organizationId, ctx.organizationId),
            eq(companies.cnpj, normalizedCnpj),
            ne(companies.id, existing.id),
          ),
        )
        .limit(1);

      if (duplicateCnpj.length > 0) {
        throw new ConflictError(
          `Já existe outra empresa cadastrada com o CNPJ ${formatCnpj(normalizedCnpj)} nesta organização.`,
        );
      }

      if (input.parentCompanyId) {
        const [parentRow] = await tx
          .select({ id: companies.id, parentCompanyId: companies.parentCompanyId })
          .from(companies)
          .where(
            and(
              eq(companies.organizationId, ctx.organizationId),
              eq(companies.id, input.parentCompanyId),
              isNull(companies.archivedAt),
            ),
          )
          .limit(1);

        if (!parentRow) {
          throw new NotFoundError('Empresa-mãe (holding) não encontrada nesta organização.');
        }

        if (parentRow.parentCompanyId === existing.id) {
          throw new ValidationError('Referência circular detectada entre holding e controlada.');
        }
      }

      const [updated] = await tx
        .update(companies)
        .set({
          clientId: input.clientId,
          parentCompanyId: input.parentCompanyId || null,
          cnpj: normalizedCnpj,
          legalName: trimmedLegalName,
          tradeName: input.tradeName?.trim() || null,
          stateRegistration: input.stateRegistration?.trim() || null,
          municipalRegistration: input.municipalRegistration?.trim() || null,
          addressStreet: input.addressStreet?.trim() || null,
          addressNumber: input.addressNumber?.trim() || null,
          addressComplement: input.addressComplement?.trim() || null,
          addressDistrict: input.addressDistrict?.trim() || null,
          addressCity: input.addressCity?.trim() || null,
          addressState: input.addressState?.trim().toUpperCase() || null,
          addressZipCode: input.addressZipCode?.replace(/\D/g, '') || null,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, existing.id))
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'company.updated',
        entityType: 'company',
        entityId: existing.id,
        changes: {
          previousLegalName: existing.legalName,
          newLegalName: updated!.legalName,
          previousCnpj: existing.cnpj,
          newCnpj: updated!.cnpj,
          previousClientId: existing.clientId,
          newClientId: updated!.clientId,
          previousParentCompanyId: existing.parentCompanyId,
          newParentCompanyId: updated!.parentCompanyId,
        },
      });

      return {
        id: updated!.id,
        cnpj: updated!.cnpj,
        legalName: updated!.legalName,
        clientId: updated!.clientId,
      };
    },
    database,
  );
}

/**
 * Ativa ou desativa uma empresa na organização.
 */
export async function setCompanyStatus(
  ctx: OfficeTenantContext,
  input: {
    companyId: string;
    status: EntityStatus;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; status: EntityStatus }> {
  assertPermission(ctx, 'company.write');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.organizationId, ctx.organizationId),
            eq(companies.id, input.companyId),
            isNull(companies.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Empresa não encontrada nesta organização.');
      }

      const [updated] = await tx
        .update(companies)
        .set({
          status: input.status,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, existing.id))
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'company.status_changed',
        entityType: 'company',
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

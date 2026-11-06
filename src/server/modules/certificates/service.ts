import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission, getOperationalScopeFilter } from '@/server/authz/permissions';
import type { OfficeTenantContext } from '@/server/context/tenant-context';
import { getAppDb } from '@/server/db/client';
import {
  activityLog,
  clients,
  companies,
  deadlines,
  demands,
  documentCategories,
  documents,
  memberships,
  users,
} from '@/server/db/schema';
import { type AnyPgDatabase, withTenant } from '@/server/db/tenant';
import { NotFoundError, ValidationError } from '@/server/errors/app-error';
import {
  CERTIFICATE_TYPE_LABELS,
  CERTIFICATE_TYPES,
  type CertificateTypeCode,
  computeBufferSha256,
} from './groq-extractor';
import { buildTenantStorageKey, persistDocumentBuffer } from './storage';

export type CertificateValidityStatus = 'expired' | 'expiring_soon' | 'valid' | 'no_expiration';

export interface CertificateRecordSummary {
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  certificateType: CertificateTypeCode;
  certificateTypeLabel: string;
  issuingAuthority: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  daysUntilExpiration: number | null;
  validityStatus: CertificateValidityStatus;
  activeAlertThreshold: number | null;
  alertDaysBefore: number[];
  controlCode: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  visibility: 'internal' | 'shared';
  clientId: string | null;
  clientName: string | null;
  companyId: string | null;
  companyLegalName: string | null;
  companyCnpj: string | null;
  demandId: string | null;
  demandCode: string | null;
  demandTitle: string | null;
  extractedMetadata: Record<string, unknown>;
  uploadedByMembershipId: string;
  uploadedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpirationAlertItem {
  id: string;
  sourceType: 'certificate' | 'deadline';
  title: string;
  subtitle: string;
  dueDate: string;
  daysRemaining: number;
  severity: 'expired' | 'critical' | 'warning';
  activeThresholdDays: number | null;
  clientId: string | null;
  clientName: string | null;
  companyId: string | null;
  companyLegalName: string | null;
  companyCnpj: string | null;
  demandId: string | null;
  demandCode: string | null;
  certificateTypeLabel?: string;
}

export interface ExpirationAlertsDashboard {
  summary: {
    totalTrackedCertificates: number;
    expiredCount: number;
    critical7DaysCount: number;
    warning30DaysCount: number;
    validCount: number;
    activeTriggeredAlertsCount: number;
  };
  alerts: ExpirationAlertItem[];
}

export const registerCertificateSchema = z.object({
  title: z.string().trim().min(3, 'Informe um título com no mínimo 3 caracteres.').max(200),
  certificateType: z.enum(CERTIFICATE_TYPES).default('OUTRA_CERTIDAO'),
  categoryName: z.string().trim().min(2).max(100).optional().nullable(),
  issuingAuthority: z.string().trim().max(160).optional().nullable(),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de emissão deve estar no formato AAAA-MM-DD.')
    .optional()
    .nullable(),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de validade deve estar no formato AAAA-MM-DD.')
    .optional()
    .nullable(),
  alertDaysBefore: z.array(z.number().int().min(1).max(365)).min(1).max(6).optional(),
  controlCode: z.string().trim().max(80).optional().nullable(),
  visibility: z.enum(['internal', 'shared']).default('internal'),
  clientId: z.string().uuid('Cliente inválido.').optional().nullable(),
  companyId: z.string().uuid('Empresa inválida.').optional().nullable(),
  demandId: z.string().uuid('Demanda inválida.').optional().nullable(),
  originalName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(3).max(120).default('application/pdf'),
  fileBuffer: z.instanceof(Buffer).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  sha256: z.string().min(32).max(128).optional(),
  extractedMetadata: z.record(z.string(), z.unknown()).optional(),
  createLinkedDeadline: z.boolean().default(true),
});

export type RegisterCertificateInput = z.input<typeof registerCertificateSchema>;

export const updateCertificateSchema = z.object({
  documentId: z.string().uuid('ID do documento inválido.'),
  title: z.string().trim().min(3, 'Informe um título com no mínimo 3 caracteres.').max(200),
  certificateType: z.enum(CERTIFICATE_TYPES),
  issuingAuthority: z.string().trim().max(160).optional().nullable(),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de emissão inválida.')
    .optional()
    .nullable(),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de validade inválida.')
    .optional()
    .nullable(),
  alertDaysBefore: z.array(z.number().int().min(1).max(365)).min(1).max(6).optional(),
  controlCode: z.string().trim().max(80).optional().nullable(),
  visibility: z.enum(['internal', 'shared']).optional(),
});

export type UpdateCertificateInput = z.input<typeof updateCertificateSchema>;

/**
 * Calcula a diferença em dias corridos entre a data de referência (hoje UTC) e uma data `YYYY-MM-DD`.
 * Retorno `< 0` indica vencido; `0` vence hoje; `> 0` dias restantes até o vencimento.
 */
export function computeDaysUntilDate(
  isoDate: string | null | undefined,
  referenceDate: Date = new Date(),
): number | null {
  if (!isoDate) return null;
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return null;
  const targetUtc = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(targetUtc)) return null;

  const refUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  return Math.round((targetUtc - refUtc) / (1000 * 60 * 60 * 24));
}

export function evaluateCertificateValidity(
  expirationDate: string | null | undefined,
  alertDaysBefore: number[] = [30, 15, 7],
  referenceDate: Date = new Date(),
): {
  daysUntilExpiration: number | null;
  validityStatus: CertificateValidityStatus;
  activeAlertThreshold: number | null;
} {
  const days = computeDaysUntilDate(expirationDate, referenceDate);
  if (days === null) {
    return {
      daysUntilExpiration: null,
      validityStatus: 'no_expiration',
      activeAlertThreshold: null,
    };
  }

  const sortedThresholds = [...alertDaysBefore].sort((a, b) => a - b);
  const maxThreshold = sortedThresholds[sortedThresholds.length - 1] ?? 30;

  let activeAlertThreshold: number | null = null;
  for (const t of sortedThresholds) {
    if (days <= t) {
      activeAlertThreshold = t;
      break;
    }
  }

  if (days < 0) {
    return {
      daysUntilExpiration: days,
      validityStatus: 'expired',
      activeAlertThreshold: sortedThresholds[0] ?? 0,
    };
  }

  if (days <= maxThreshold) {
    return {
      daysUntilExpiration: days,
      validityStatus: 'expiring_soon',
      activeAlertThreshold,
    };
  }

  return {
    daysUntilExpiration: days,
    validityStatus: 'valid',
    activeAlertThreshold: null,
  };
}

/**
 * Registra uma nova Certidão / Documento Regulatório:
 * - Valida permissões RBAC (`document.write`).
 * - Garante a integridade da chave estrangeira Cliente–Empresa (Decisão A2): se `companyId`
 *   for informada e `clientId` não for informada, resolve `clientId` automaticamente da empresa;
 *   se ambos forem informados, valida que a empresa pertence ao cliente na mesma organização.
 * - Persiste o binário PDF em storage isolado por tenant (quando enviado) e calcula SHA-256.
 * - Cria ou reutiliza a categoria documental (`Certidões e Regularidade Fiscal` por padrão).
 * - Se vinculada a uma `demandId` e possuir `expirationDate`, registra automaticamente uma obrigação
 *   em `deadlines` (`kind = 'legal'`) para unificar o controle de prazos fatais (Decisão A7).
 * - Grava auditoria imutável em `activity_log`.
 */
export async function registerCertificateDocument(
  ctx: OfficeTenantContext,
  rawInput: RegisterCertificateInput,
  database?: AnyPgDatabase,
): Promise<{
  id: string;
  title: string;
  certificateType: CertificateTypeCode;
  expirationDate: string | null;
  validityStatus: CertificateValidityStatus;
  daysUntilExpiration: number | null;
  linkedDeadlineId: string | null;
}> {
  assertPermission(ctx, 'document.write');

  const parsed = registerCertificateSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'root';
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    throw new ValidationError('Dados inválidos para registro da certidão.', fieldErrors);
  }

  const input = parsed.data;
  if (!input.clientId && !input.companyId && !input.demandId) {
    throw new ValidationError(
      'Vincule a certidão a pelo menos um Cliente, Empresa ou Demanda operacional.',
      { clientId: ['Selecione um Cliente, Empresa ou Demanda.'] },
    );
  }

  if (input.issueDate && input.expirationDate && input.expirationDate < input.issueDate) {
    throw new ValidationError(
      'A data de validade não pode ser anterior à data de emissão da certidão.',
      { expirationDate: ['A data de validade deve ser posterior ou igual à emissão.'] },
    );
  }

  const db = database ?? (await getAppDb());

  return withTenant(
    db,
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
    },
    async (tx) => {
      let resolvedClientId = input.clientId ?? null;
      let resolvedCompanyId = input.companyId ?? null;
      const resolvedDemandId = input.demandId ?? null;

      // 1. Se demandId foi informada, valida existência e escopo de departamento
      if (resolvedDemandId) {
        const [demandRow] = await tx
          .select({
            id: demands.id,
            clientId: demands.clientId,
            companyId: demands.companyId,
            departmentId: demands.departmentId,
            assigneeMembershipId: demands.assigneeMembershipId,
          })
          .from(demands)
          .where(
            and(
              eq(demands.organizationId, ctx.organizationId),
              eq(demands.id, resolvedDemandId),
              isNull(demands.archivedAt),
            ),
          )
          .limit(1);

        if (!demandRow) {
          throw new NotFoundError('Demanda vinculada não encontrada nesta organização.');
        }

        assertPermission(ctx, 'document.write', {
          departmentId: demandRow.departmentId,
          assigneeMembershipId: demandRow.assigneeMembershipId,
        });

        if (!resolvedClientId) {
          resolvedClientId = demandRow.clientId;
        }
        if (!resolvedCompanyId && demandRow.companyId) {
          resolvedCompanyId = demandRow.companyId;
        }
      }

      // 2. Se companyId foi informada, valida existência e vínculo estrito com clientId (Decisão A2)
      if (resolvedCompanyId) {
        const [companyRow] = await tx
          .select({
            id: companies.id,
            clientId: companies.clientId,
            legalName: companies.legalName,
          })
          .from(companies)
          .where(
            and(
              eq(companies.organizationId, ctx.organizationId),
              eq(companies.id, resolvedCompanyId),
            ),
          )
          .limit(1);

        if (!companyRow) {
          throw new NotFoundError('Empresa selecionada não encontrada nesta organização.');
        }

        if (resolvedClientId && companyRow.clientId !== resolvedClientId) {
          throw new ValidationError(
            'Integridade Cliente–Empresa violada: a pessoa jurídica selecionada pertence a outro cliente.',
            { companyId: ['A empresa selecionada não pertence ao cliente informado.'] },
          );
        }

        resolvedClientId = companyRow.clientId;
      }

      // 3. Se clientId foi informado, valida que pertence à organização
      if (resolvedClientId) {
        const [clientRow] = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(
            and(eq(clients.organizationId, ctx.organizationId), eq(clients.id, resolvedClientId)),
          )
          .limit(1);

        if (!clientRow) {
          throw new NotFoundError('Cliente selecionado não encontrado nesta organização.');
        }
      }

      // 4. Resolve ou cria a categoria documental
      const targetCategoryName = input.categoryName?.trim() || 'Certidões e Regularidade Fiscal';
      const [existingCat] = await tx
        .select({ id: documentCategories.id })
        .from(documentCategories)
        .where(
          and(
            eq(documentCategories.organizationId, ctx.organizationId),
            eq(documentCategories.name, targetCategoryName),
          ),
        )
        .limit(1);

      let categoryId = existingCat?.id ?? null;
      if (!categoryId) {
        const [createdCat] = await tx
          .insert(documentCategories)
          .values({
            organizationId: ctx.organizationId,
            name: targetCategoryName,
          })
          .returning({ id: documentCategories.id });
        categoryId = createdCat!.id;
      }

      // 5. Armazena o PDF e calcula hash SHA-256
      const storageKey = buildTenantStorageKey(ctx.organizationId, input.originalName);
      let sizeBytes = input.sizeBytes ?? 0;
      let sha256 = input.sha256 ?? '';

      if (input.fileBuffer) {
        sizeBytes = input.fileBuffer.byteLength;
        sha256 = computeBufferSha256(input.fileBuffer);
        await persistDocumentBuffer(storageKey, input.fileBuffer);
      } else if (!sha256) {
        sha256 = computeBufferSha256(Buffer.from(`${storageKey}:${input.title}`));
      }

      const alertDays = input.alertDaysBefore?.length
        ? [...new Set(input.alertDaysBefore)].sort((a, b) => b - a)
        : [30, 15, 7];

      const [insertedDoc] = await tx
        .insert(documents)
        .values({
          organizationId: ctx.organizationId,
          title: input.title,
          categoryId,
          storageKey,
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes,
          sha256,
          visibility: input.visibility,
          clientId: resolvedClientId,
          companyId: resolvedCompanyId,
          demandId: resolvedDemandId,
          certificateType: input.certificateType,
          issuingAuthority: input.issuingAuthority ?? null,
          issueDate: input.issueDate ?? null,
          expirationDate: input.expirationDate ?? null,
          alertDaysBefore: alertDays,
          controlCode: input.controlCode ?? null,
          extractedMetadata: input.extractedMetadata ?? {},
          uploadedByMembershipId: ctx.membershipId,
        })
        .returning({
          id: documents.id,
          title: documents.title,
          expirationDate: documents.expirationDate,
        });

      const createdDoc = insertedDoc!;

      // 6. Se houver demandId e expirationDate, registra prazo específico em `deadlines` (Decisão A7)
      let linkedDeadlineId: string | null = null;
      if (input.createLinkedDeadline && resolvedDemandId && input.expirationDate) {
        const [insertedDeadline] = await tx
          .insert(deadlines)
          .values({
            organizationId: ctx.organizationId,
            demandId: resolvedDemandId,
            kind: 'legal',
            title: `Renovação / Vencimento: ${input.title}`,
            dueDate: input.expirationDate,
            status: 'pending',
            alertDaysBefore: alertDays,
          })
          .returning({ id: deadlines.id });

        linkedDeadlineId = insertedDeadline?.id ?? null;
      }

      // 7. Registra auditoria imutável em activity_log
      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'certificate.registered',
        entityType: 'document',
        entityId: createdDoc.id,
        demandId: resolvedDemandId,
        changes: {
          title: input.title,
          certificateType: input.certificateType,
          issuingAuthority: input.issuingAuthority ?? null,
          issueDate: input.issueDate ?? null,
          expirationDate: input.expirationDate ?? null,
          controlCode: input.controlCode ?? null,
          clientId: resolvedClientId,
          companyId: resolvedCompanyId,
          demandId: resolvedDemandId,
          linkedDeadlineId,
          sha256,
        },
      });

      const validity = evaluateCertificateValidity(createdDoc.expirationDate, alertDays);

      return {
        id: createdDoc.id,
        title: createdDoc.title,
        certificateType: input.certificateType,
        expirationDate: createdDoc.expirationDate,
        validityStatus: validity.validityStatus,
        daysUntilExpiration: validity.daysUntilExpiration,
        linkedDeadlineId,
      };
    },
  );
}

/**
 * Atualiza metadados e datas de validade de uma certidão existente, registrando auditoria.
 */
export async function updateCertificateDocument(
  ctx: OfficeTenantContext,
  rawInput: UpdateCertificateInput,
  database?: AnyPgDatabase,
): Promise<{
  id: string;
  title: string;
  expirationDate: string | null;
  validityStatus: CertificateValidityStatus;
}> {
  assertPermission(ctx, 'document.write');

  const parsed = updateCertificateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError('Dados inválidos para atualização da certidão.');
  }
  const input = parsed.data;

  if (input.issueDate && input.expirationDate && input.expirationDate < input.issueDate) {
    throw new ValidationError(
      'A data de validade não pode ser anterior à data de emissão da certidão.',
      { expirationDate: ['A data de validade deve ser posterior ou igual à emissão.'] },
    );
  }

  const db = database ?? (await getAppDb());

  return withTenant(
    db,
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.organizationId, ctx.organizationId),
            eq(documents.id, input.documentId),
            isNull(documents.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Certidão não encontrada nesta organização.');
      }

      const alertDays = input.alertDaysBefore?.length
        ? [...new Set(input.alertDaysBefore)].sort((a, b) => b - a)
        : existing.alertDaysBefore;

      await tx
        .update(documents)
        .set({
          title: input.title,
          certificateType: input.certificateType,
          issuingAuthority:
            input.issuingAuthority !== undefined
              ? input.issuingAuthority
              : existing.issuingAuthority,
          issueDate: input.issueDate !== undefined ? input.issueDate : existing.issueDate,
          expirationDate:
            input.expirationDate !== undefined ? input.expirationDate : existing.expirationDate,
          alertDaysBefore: alertDays,
          controlCode:
            input.controlCode !== undefined ? input.controlCode : existing.controlCode,
          visibility: input.visibility ?? existing.visibility,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documents.organizationId, ctx.organizationId),
            eq(documents.id, input.documentId),
          ),
        );

      const finalExpiration =
        input.expirationDate !== undefined ? input.expirationDate : existing.expirationDate;

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'certificate.updated',
        entityType: 'document',
        entityId: existing.id,
        demandId: existing.demandId,
        changes: {
          previousTitle: existing.title,
          newTitle: input.title,
          previousExpirationDate: existing.expirationDate,
          newExpirationDate: finalExpiration,
          certificateType: input.certificateType,
        },
      });

      const validity = evaluateCertificateValidity(finalExpiration, alertDays);
      return {
        id: existing.id,
        title: input.title,
        expirationDate: finalExpiration,
        validityStatus: validity.validityStatus,
      };
    },
  );
}

/**
 * Arquiva uma certidão (soft delete auditado em `archived_at` + `activity_log`).
 */
export async function archiveCertificateDocument(
  ctx: OfficeTenantContext,
  documentId: string,
  database?: AnyPgDatabase,
): Promise<{ id: string }> {
  assertPermission(ctx, 'document.write');

  const db = database ?? (await getAppDb());

  return withTenant(
    db,
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select({
          id: documents.id,
          title: documents.title,
          demandId: documents.demandId,
        })
        .from(documents)
        .where(
          and(
            eq(documents.organizationId, ctx.organizationId),
            eq(documents.id, documentId),
            isNull(documents.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Certidão não encontrada ou já arquivada.');
      }

      await tx
        .update(documents)
        .set({
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(eq(documents.organizationId, ctx.organizationId), eq(documents.id, documentId)),
        );

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'certificate.archived',
        entityType: 'document',
        entityId: existing.id,
        demandId: existing.demandId,
        changes: {
          title: existing.title,
        },
      });

      return { id: existing.id };
    },
  );
}

export interface ListCertificatesFilters {
  search?: string;
  clientId?: string;
  companyId?: string;
  demandId?: string;
  certificateType?: CertificateTypeCode;
  validityStatus?: CertificateValidityStatus;
}

/**
 * Lista todas as certidões e documentos regulatórios ativos da organização,
 * calculando em tempo real o status de validade (`expired`, `expiring_soon`, `valid`, `no_expiration`)
 * e aplicando filtros combináveis.
 */
export async function listOrganizationCertificates(
  ctx: OfficeTenantContext,
  filters: ListCertificatesFilters = {},
  database?: AnyPgDatabase,
  referenceDate: Date = new Date(),
): Promise<CertificateRecordSummary[]> {
  const scope = getOperationalScopeFilter(ctx);
  if (scope.mode === 'scoped' && scope.departmentIds.length === 0) {
    assertPermission(ctx, 'document.read');
  }

  const db = database ?? (await getAppDb());

  return withTenant(
    db,
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
    },
    async (tx) => {
      const [docRows, catRows, clientRows, companyRows, demandRows, memberRows] =
        await Promise.all([
          tx
            .select()
            .from(documents)
            .where(
              and(
                eq(documents.organizationId, ctx.organizationId),
                isNull(documents.archivedAt),
              ),
            )
            .orderBy(asc(documents.expirationDate), desc(documents.createdAt)),
          tx
            .select()
            .from(documentCategories)
            .where(eq(documentCategories.organizationId, ctx.organizationId)),
          tx.select().from(clients).where(eq(clients.organizationId, ctx.organizationId)),
          tx.select().from(companies).where(eq(companies.organizationId, ctx.organizationId)),
          tx
            .select({
              id: demands.id,
              code: demands.code,
              title: demands.title,
              departmentId: demands.departmentId,
              assigneeMembershipId: demands.assigneeMembershipId,
            })
            .from(demands)
            .where(eq(demands.organizationId, ctx.organizationId)),
          tx
            .select({
              membershipId: memberships.id,
              name: users.name,
            })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .where(eq(memberships.organizationId, ctx.organizationId)),
        ]);

      const catMap = new Map(catRows.map((c) => [c.id, c.name]));
      const clientMap = new Map(clientRows.map((c) => [c.id, c.name]));
      const companyMap = new Map(
        companyRows.map((c) => [c.id, { legalName: c.legalName, cnpj: c.cnpj }]),
      );
      const demandMap = new Map(demandRows.map((d) => [d.id, d]));
      const memberMap = new Map(memberRows.map((m) => [m.membershipId, m.name]));

      const searchLower = filters.search?.trim().toLowerCase() ?? '';

      const results: CertificateRecordSummary[] = [];

      for (const row of docRows) {
        const linkedDemand = row.demandId ? demandMap.get(row.demandId) : undefined;

        // Filtro de escopo por departamento quando vinculado a demanda
        if (scope.mode === 'scoped' && linkedDemand) {
          const inDept = scope.departmentIds.includes(linkedDemand.departmentId);
          const isAssignee = linkedDemand.assigneeMembershipId === scope.membershipId;
          if (!inDept && !isAssignee) {
            continue;
          }
        }

        const certType: CertificateTypeCode =
          row.certificateType && CERTIFICATE_TYPES.includes(row.certificateType as CertificateTypeCode)
            ? (row.certificateType as CertificateTypeCode)
            : 'OUTRA_CERTIDAO';

        const certLabel = CERTIFICATE_TYPE_LABELS[certType];
        const validity = evaluateCertificateValidity(
          row.expirationDate,
          row.alertDaysBefore,
          referenceDate,
        );

        const clientName = row.clientId ? (clientMap.get(row.clientId) ?? null) : null;
        const companyInfo = row.companyId ? companyMap.get(row.companyId) : undefined;

        if (filters.clientId && row.clientId !== filters.clientId) continue;
        if (filters.companyId && row.companyId !== filters.companyId) continue;
        if (filters.demandId && row.demandId !== filters.demandId) continue;
        if (filters.certificateType && certType !== filters.certificateType) continue;
        if (filters.validityStatus && validity.validityStatus !== filters.validityStatus) continue;

        if (searchLower) {
          const haystack = [
            row.title,
            certLabel,
            row.issuingAuthority ?? '',
            row.controlCode ?? '',
            row.originalName,
            clientName ?? '',
            companyInfo?.legalName ?? '',
            companyInfo?.cnpj ?? '',
            linkedDemand?.code ?? '',
          ]
            .join(' ')
            .toLowerCase();

          if (!haystack.includes(searchLower)) continue;
        }

        results.push({
          id: row.id,
          title: row.title,
          categoryId: row.categoryId,
          categoryName: row.categoryId ? (catMap.get(row.categoryId) ?? null) : null,
          certificateType: certType,
          certificateTypeLabel: certLabel,
          issuingAuthority: row.issuingAuthority,
          issueDate: row.issueDate,
          expirationDate: row.expirationDate,
          daysUntilExpiration: validity.daysUntilExpiration,
          validityStatus: validity.validityStatus,
          activeAlertThreshold: validity.activeAlertThreshold,
          alertDaysBefore: row.alertDaysBefore,
          controlCode: row.controlCode,
          originalName: row.originalName,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          sha256: row.sha256,
          visibility: row.visibility,
          clientId: row.clientId,
          clientName,
          companyId: row.companyId,
          companyLegalName: companyInfo?.legalName ?? null,
          companyCnpj: companyInfo?.cnpj ?? null,
          demandId: row.demandId,
          demandCode: linkedDemand?.code ?? null,
          demandTitle: linkedDemand?.title ?? null,
          extractedMetadata: row.extractedMetadata ?? {},
          uploadedByMembershipId: row.uploadedByMembershipId,
          uploadedByName: memberMap.get(row.uploadedByMembershipId) ?? 'Membro da Equipe',
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      }

      return results;
    },
  );
}

/**
 * Motor Central de Alertas de Vencimento (`getOrganizationExpirationAlerts`):
 * Consolida certidões monitoradas (`documents.expiration_date`) e obrigações específicas (`deadlines.due_date`)
 * vencidas ou dentro da janela de alerta configurável (ex.: 30, 15 e 7 dias), alimentando tanto o Painel
 * Geral (`/[orgSlug]`) quanto a Central de Certidões (`/[orgSlug]/certidoes`).
 */
export async function getOrganizationExpirationAlerts(
  ctx: OfficeTenantContext,
  database?: AnyPgDatabase,
  referenceDate: Date = new Date(),
): Promise<ExpirationAlertsDashboard> {
  const certs = await listOrganizationCertificates(ctx, {}, database, referenceDate);

  const db = database ?? (await getAppDb());

  const pendingDeadlines = await withTenant(
    db,
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
    },
    async (tx) => {
      return tx
        .select({
          id: deadlines.id,
          title: deadlines.title,
          dueDate: deadlines.dueDate,
          kind: deadlines.kind,
          alertDaysBefore: deadlines.alertDaysBefore,
          demandId: deadlines.demandId,
          demandCode: demands.code,
          clientId: demands.clientId,
          companyId: demands.companyId,
        })
        .from(deadlines)
        .innerJoin(
          demands,
          and(
            eq(demands.organizationId, deadlines.organizationId),
            eq(demands.id, deadlines.demandId),
          ),
        )
        .where(
          and(
            eq(deadlines.organizationId, ctx.organizationId),
            eq(deadlines.status, 'pending'),
            isNull(demands.archivedAt),
          ),
        )
        .orderBy(asc(deadlines.dueDate));
    },
  );

  let totalTrackedCertificates = 0;
  let expiredCount = 0;
  let critical7DaysCount = 0;
  let warning30DaysCount = 0;
  let validCount = 0;

  const alerts: ExpirationAlertItem[] = [];

  for (const cert of certs) {
    if (!cert.expirationDate || cert.daysUntilExpiration === null) {
      continue;
    }

    totalTrackedCertificates += 1;
    const days = cert.daysUntilExpiration;

    if (days < 0) {
      expiredCount += 1;
      alerts.push({
        id: cert.id,
        sourceType: 'certificate',
        title: cert.title,
        subtitle: cert.issuingAuthority ?? cert.certificateTypeLabel,
        dueDate: cert.expirationDate,
        daysRemaining: days,
        severity: 'expired',
        activeThresholdDays: cert.activeAlertThreshold,
        clientId: cert.clientId,
        clientName: cert.clientName,
        companyId: cert.companyId,
        companyLegalName: cert.companyLegalName,
        companyCnpj: cert.companyCnpj,
        demandId: cert.demandId,
        demandCode: cert.demandCode,
        certificateTypeLabel: cert.certificateTypeLabel,
      });
    } else if (days <= 7) {
      critical7DaysCount += 1;
      alerts.push({
        id: cert.id,
        sourceType: 'certificate',
        title: cert.title,
        subtitle: cert.issuingAuthority ?? cert.certificateTypeLabel,
        dueDate: cert.expirationDate,
        daysRemaining: days,
        severity: 'critical',
        activeThresholdDays: cert.activeAlertThreshold ?? 7,
        clientId: cert.clientId,
        clientName: cert.clientName,
        companyId: cert.companyId,
        companyLegalName: cert.companyLegalName,
        companyCnpj: cert.companyCnpj,
        demandId: cert.demandId,
        demandCode: cert.demandCode,
        certificateTypeLabel: cert.certificateTypeLabel,
      });
    } else if (cert.validityStatus === 'expiring_soon' || days <= 30) {
      warning30DaysCount += 1;
      alerts.push({
        id: cert.id,
        sourceType: 'certificate',
        title: cert.title,
        subtitle: cert.issuingAuthority ?? cert.certificateTypeLabel,
        dueDate: cert.expirationDate,
        daysRemaining: days,
        severity: 'warning',
        activeThresholdDays: cert.activeAlertThreshold ?? 30,
        clientId: cert.clientId,
        clientName: cert.clientName,
        companyId: cert.companyId,
        companyLegalName: cert.companyLegalName,
        companyCnpj: cert.companyCnpj,
        demandId: cert.demandId,
        demandCode: cert.demandCode,
        certificateTypeLabel: cert.certificateTypeLabel,
      });
    } else {
      validCount += 1;
    }
  }

  // Inclui também obrigações pendentes de demandas que não sejam duplicatas exatas
  for (const dl of pendingDeadlines) {
    const days = computeDaysUntilDate(dl.dueDate, referenceDate);
    if (days === null || days > 15) continue;

    const alreadyRepresented = alerts.some(
      (a) => a.demandId === dl.demandId && a.dueDate === dl.dueDate,
    );
    if (alreadyRepresented) continue;

    alerts.push({
      id: dl.id,
      sourceType: 'deadline',
      title: dl.title,
      subtitle: `Obrigação vinculada à demanda ${dl.demandCode}`,
      dueDate: dl.dueDate,
      daysRemaining: days,
      severity: days < 0 ? 'expired' : days <= 7 ? 'critical' : 'warning',
      activeThresholdDays: days <= 1 ? 1 : days <= 3 ? 3 : 15,
      clientId: dl.clientId,
      clientName: null,
      companyId: dl.companyId,
      companyLegalName: null,
      companyCnpj: null,
      demandId: dl.demandId,
      demandCode: dl.demandCode,
    });
  }

  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    summary: {
      totalTrackedCertificates,
      expiredCount,
      critical7DaysCount,
      warning30DaysCount,
      validCount,
      activeTriggeredAlertsCount: alerts.length,
    },
    alerts,
  };
}

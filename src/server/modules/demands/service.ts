import 'server-only';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { assertPermission, getOperationalScopeFilter } from '@/server/authz/permissions';
import type { OfficeTenantContext } from '@/server/context/tenant-context';
import { getDb } from '@/server/db/client';
import {
  activityLog,
  clients,
  comments,
  companies,
  demandParticipants,
  demands,
  demandStageHistory,
  departments,
  memberships,
  serviceCategories,
  serviceTypes,
  users,
  workflows,
  workflowStages,
  workflowTransitions,
} from '@/server/db/schema';
import { type AnyPgDatabase, withTenant } from '@/server/db/tenant';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/errors/app-error';

export type DemandPriority = 'low' | 'medium' | 'high' | 'urgent';
export type WorkflowStageCategory = 'backlog' | 'active' | 'waiting' | 'done' | 'cancelled';
export type ParticipantRole = 'collaborator' | 'watcher';

export interface DemandSummaryDTO {
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
  openedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface DemandWorkflowOption {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

export interface DemandWorkflowStageOption {
  id: string;
  workflowId: string;
  name: string;
  position: number;
  category: WorkflowStageCategory;
}

export interface DemandServiceTypeOption {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  defaultDepartmentId: string | null;
  defaultWorkflowId: string;
  defaultDueDays: number | null;
}

export interface DemandParticipantDTO {
  id: string;
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: ParticipantRole;
  createdAt: Date;
}

export interface DemandStageHistoryEntryDTO {
  id: string;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string;
  toStageName: string;
  toStageCategory: WorkflowStageCategory;
  movedByMembershipId: string;
  movedByName: string;
  note: string | null;
  movedAt: Date;
}

export interface DemandCommentDTO {
  id: string;
  authorMembershipId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  visibility: 'internal' | 'external';
  createdAt: Date;
}

export interface DemandAuditLogEntryDTO {
  id: string;
  action: string;
  actorName: string | null;
  changes: Record<string, unknown> | null;
  createdAt: Date;
}

export interface DemandDetailsDTO extends DemandSummaryDTO {
  workflowName: string;
  createdByMembershipId: string;
  createdByName: string;
  availableStages: DemandWorkflowStageOption[];
  allowedTargetStageIds: string[];
  participants: DemandParticipantDTO[];
  stageHistory: DemandStageHistoryEntryDTO[];
  comments: DemandCommentDTO[];
  activityTimeline: DemandAuditLogEntryDTO[];
}

export interface ListDemandsFilter {
  search?: string;
  clientId?: string;
  companyId?: string;
  departmentId?: string;
  statusCategory?: WorkflowStageCategory;
  stageId?: string;
  assigneeMembershipId?: string;
  priority?: DemandPriority;
}

export interface DemandCatalogMetadata {
  workflows: DemandWorkflowOption[];
  serviceTypes: DemandServiceTypeOption[];
  stages: DemandWorkflowStageOption[];
}

/**
 * Retorna as esteiras ativas, tipos de serviço e etapas de workflow disponíveis na organização
 * para popular formulários e filtros de demandas.
 */
export async function listDemandCatalogMetadata(
  ctx: OfficeTenantContext,
  database: AnyPgDatabase = getDb(),
): Promise<DemandCatalogMetadata> {
  assertPermission(ctx, 'workflow.read');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const wfRows = await tx
        .select({
          id: workflows.id,
          name: workflows.name,
          description: workflows.description,
          isDefault: workflows.isDefault,
        })
        .from(workflows)
        .where(and(eq(workflows.organizationId, ctx.organizationId), isNull(workflows.archivedAt)))
        .orderBy(asc(workflows.createdAt));

      const svcRows = await tx
        .select({
          id: serviceTypes.id,
          name: serviceTypes.name,
          categoryId: serviceTypes.categoryId,
          categoryName: serviceCategories.name,
          defaultDepartmentId: serviceTypes.defaultDepartmentId,
          defaultWorkflowId: serviceTypes.defaultWorkflowId,
          defaultDueDays: serviceTypes.defaultDueDays,
        })
        .from(serviceTypes)
        .innerJoin(
          serviceCategories,
          and(
            eq(serviceCategories.organizationId, serviceTypes.organizationId),
            eq(serviceCategories.id, serviceTypes.categoryId),
          ),
        )
        .where(
          and(eq(serviceTypes.organizationId, ctx.organizationId), eq(serviceTypes.active, true)),
        )
        .orderBy(asc(serviceCategories.position), asc(serviceTypes.name));

      const stageRows = await tx
        .select({
          id: workflowStages.id,
          workflowId: workflowStages.workflowId,
          name: workflowStages.name,
          position: workflowStages.position,
          category: workflowStages.category,
        })
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            isNull(workflowStages.archivedAt),
          ),
        )
        .orderBy(asc(workflowStages.position));

      return {
        workflows: wfRows,
        serviceTypes: svcRows,
        stages: stageRows,
      };
    },
    database,
  );
}

/**
 * Lista as demandas da organização aplicando estritamente o filtro de escopo RBAC
 * por departamento (`getOperationalScopeFilter` — Risco R2 e Decisão A5) e filtros combinados.
 */
export async function listOrganizationDemands(
  ctx: OfficeTenantContext,
  filters: ListDemandsFilter = {},
  database: AnyPgDatabase = getDb(),
): Promise<DemandSummaryDTO[]> {
  const scope = getOperationalScopeFilter(ctx);

  const assigneeMemberships = alias(memberships, 'assignee_memberships');
  const assigneeUsers = alias(users, 'assignee_users');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const conditions = [
        eq(demands.organizationId, ctx.organizationId),
        isNull(demands.archivedAt),
      ];

      // Aplicação estrita do escopo RBAC por departamento/atribuição/participação no SQL
      if (scope.mode === 'scoped') {
        const participantSubquery = sql`EXISTS (
          SELECT 1 FROM public.demand_participants dp
          WHERE dp.organization_id = ${demands.organizationId}
            AND dp.demand_id = ${demands.id}
            AND dp.membership_id = ${scope.membershipId}
        )`;

        if (scope.departmentIds.length > 0) {
          conditions.push(
            or(
              inArray(demands.departmentId, scope.departmentIds),
              eq(demands.assigneeMembershipId, scope.membershipId),
              participantSubquery,
            )!,
          );
        } else {
          conditions.push(
            or(eq(demands.assigneeMembershipId, scope.membershipId), participantSubquery)!,
          );
        }
      }

      if (filters.clientId) {
        conditions.push(eq(demands.clientId, filters.clientId));
      }

      if (filters.companyId) {
        conditions.push(eq(demands.companyId, filters.companyId));
      }

      if (filters.departmentId) {
        conditions.push(eq(demands.departmentId, filters.departmentId));
      }

      if (filters.statusCategory) {
        conditions.push(eq(demands.statusCategory, filters.statusCategory));
      }

      if (filters.stageId) {
        conditions.push(eq(demands.stageId, filters.stageId));
      }

      if (filters.assigneeMembershipId) {
        conditions.push(eq(demands.assigneeMembershipId, filters.assigneeMembershipId));
      }

      if (filters.priority) {
        conditions.push(eq(demands.priority, filters.priority));
      }

      const trimmedSearch = filters.search?.trim();
      if (trimmedSearch) {
        conditions.push(
          or(
            ilike(demands.code, `%${trimmedSearch}%`),
            ilike(demands.title, `%${trimmedSearch}%`),
            ilike(clients.name, `%${trimmedSearch}%`),
            ilike(companies.legalName, `%${trimmedSearch}%`),
          )!,
        );
      }

      const rows = await tx
        .select({
          id: demands.id,
          number: demands.number,
          code: demands.code,
          title: demands.title,
          description: demands.description,
          clientId: demands.clientId,
          clientName: clients.name,
          companyId: demands.companyId,
          companyLegalName: companies.legalName,
          companyCnpj: companies.cnpj,
          serviceTypeId: demands.serviceTypeId,
          serviceTypeName: serviceTypes.name,
          serviceCategoryName: serviceCategories.name,
          workflowId: demands.workflowId,
          stageId: demands.stageId,
          stageName: workflowStages.name,
          statusCategory: demands.statusCategory,
          departmentId: demands.departmentId,
          departmentName: departments.name,
          assigneeMembershipId: demands.assigneeMembershipId,
          assigneeName: assigneeUsers.name,
          assigneeEmail: assigneeUsers.email,
          priority: demands.priority,
          dueDate: demands.dueDate,
          openedAt: demands.openedAt,
          completedAt: demands.completedAt,
          updatedAt: demands.updatedAt,
        })
        .from(demands)
        .innerJoin(
          clients,
          and(eq(clients.organizationId, demands.organizationId), eq(clients.id, demands.clientId)),
        )
        .leftJoin(
          companies,
          and(
            eq(companies.organizationId, demands.organizationId),
            eq(companies.id, demands.companyId),
          ),
        )
        .innerJoin(
          serviceTypes,
          and(
            eq(serviceTypes.organizationId, demands.organizationId),
            eq(serviceTypes.id, demands.serviceTypeId),
          ),
        )
        .innerJoin(
          serviceCategories,
          and(
            eq(serviceCategories.organizationId, serviceTypes.organizationId),
            eq(serviceCategories.id, serviceTypes.categoryId),
          ),
        )
        .innerJoin(
          workflowStages,
          and(
            eq(workflowStages.organizationId, demands.organizationId),
            eq(workflowStages.id, demands.stageId),
          ),
        )
        .innerJoin(
          departments,
          and(
            eq(departments.organizationId, demands.organizationId),
            eq(departments.id, demands.departmentId),
          ),
        )
        .leftJoin(
          assigneeMemberships,
          and(
            eq(assigneeMemberships.organizationId, demands.organizationId),
            eq(assigneeMemberships.id, demands.assigneeMembershipId),
          ),
        )
        .leftJoin(assigneeUsers, eq(assigneeUsers.id, assigneeMemberships.userId))
        .where(and(...conditions))
        .orderBy(desc(demands.number));

      return rows.map((row) => ({
        id: row.id,
        number: row.number,
        code: row.code,
        title: row.title,
        description: row.description,
        clientId: row.clientId,
        clientName: row.clientName,
        companyId: row.companyId,
        companyLegalName: row.companyLegalName ?? null,
        companyCnpj: row.companyCnpj ?? null,
        serviceTypeId: row.serviceTypeId,
        serviceTypeName: row.serviceTypeName,
        serviceCategoryName: row.serviceCategoryName,
        workflowId: row.workflowId,
        stageId: row.stageId,
        stageName: row.stageName,
        statusCategory: row.statusCategory,
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        assigneeMembershipId: row.assigneeMembershipId,
        assigneeName: row.assigneeName ?? null,
        assigneeEmail: row.assigneeEmail ?? null,
        priority: row.priority,
        dueDate: row.dueDate,
        openedAt: row.openedAt,
        completedAt: row.completedAt,
        updatedAt: row.updatedAt,
      }));
    },
    database,
  );
}

/**
 * Abre uma nova Demanda / Ordem de Serviço na organização:
 * - Valida RBAC (`demand.create` com escopo do departamento responsável).
 * - Valida integridade referencial da FK tripla `(organization_id, client_id, company_id)`.
 * - Deriva `statusCategory` da etapa inicial do workflow (Decisão A6).
 * - Registra histórico inicial de etapa (`demand_stage_history`) e auditoria (`activity_log`).
 */
export async function createDemand(
  ctx: OfficeTenantContext,
  input: {
    title: string;
    description?: string | null;
    clientId: string;
    companyId?: string | null;
    serviceTypeId?: string | null;
    workflowId?: string | null;
    departmentId: string;
    assigneeMembershipId?: string | null;
    stageId?: string | null;
    priority?: DemandPriority;
    dueDate?: string | null;
    participantMembershipIds?: string[];
  },
  database: AnyPgDatabase = getDb(),
): Promise<{
  id: string;
  number: number;
  code: string;
  title: string;
  statusCategory: WorkflowStageCategory;
}> {
  assertPermission(ctx, 'demand.create', {
    departmentId: input.departmentId,
  });

  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length < 3) {
    throw new ValidationError('O título da demanda deve ter pelo menos 3 caracteres.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      // 1. Valida cliente na organização
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
        throw new NotFoundError('Cliente selecionado não encontrado nesta organização.');
      }

      // 2. Valida FK Tripla (organization_id, client_id, company_id) quando companyId é informado
      if (input.companyId) {
        const [companyRow] = await tx
          .select({ id: companies.id, clientId: companies.clientId })
          .from(companies)
          .where(
            and(
              eq(companies.organizationId, ctx.organizationId),
              eq(companies.id, input.companyId),
              isNull(companies.archivedAt),
            ),
          )
          .limit(1);

        if (!companyRow) {
          throw new NotFoundError('Empresa selecionada não encontrada nesta organização.');
        }

        if (companyRow.clientId !== input.clientId) {
          throw new ValidationError(
            'A empresa selecionada não pertence ao cliente informado nesta demanda (violação de integridade Cliente–Empresa).',
          );
        }
      }

      // 3. Valida departamento responsável na organização
      const [deptRow] = await tx
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.organizationId, ctx.organizationId),
            eq(departments.id, input.departmentId),
            isNull(departments.archivedAt),
          ),
        )
        .limit(1);

      if (!deptRow) {
        throw new NotFoundError('Departamento responsável não encontrado nesta organização.');
      }

      // 4. Valida responsável principal (assigneeMembershipId) quando informado
      if (input.assigneeMembershipId) {
        const [assigneeRow] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.organizationId, ctx.organizationId),
              eq(memberships.id, input.assigneeMembershipId),
              eq(memberships.kind, 'internal'),
              eq(memberships.status, 'active'),
            ),
          )
          .limit(1);

        if (!assigneeRow) {
          throw new NotFoundError(
            'Responsável atribuído não encontrado ou inativo nesta organização.',
          );
        }
      }

      // 5. Resolve tipo de serviço e workflow
      let resolvedServiceType;
      if (input.serviceTypeId) {
        const [svc] = await tx
          .select()
          .from(serviceTypes)
          .where(
            and(
              eq(serviceTypes.organizationId, ctx.organizationId),
              eq(serviceTypes.id, input.serviceTypeId),
            ),
          )
          .limit(1);
        if (!svc) {
          throw new NotFoundError('Tipo de serviço não encontrado nesta organização.');
        }
        resolvedServiceType = svc;
      } else {
        const [defaultSvc] = await tx
          .select()
          .from(serviceTypes)
          .where(eq(serviceTypes.organizationId, ctx.organizationId))
          .orderBy(asc(serviceTypes.createdAt))
          .limit(1);
        if (!defaultSvc) {
          throw new ValidationError('Nenhum tipo de serviço configurado para esta organização.');
        }
        resolvedServiceType = defaultSvc;
      }

      let workflowId = resolvedServiceType.defaultWorkflowId;
      if (input.workflowId) {
        const [wfRow] = await tx
          .select({ id: workflows.id })
          .from(workflows)
          .where(
            and(
              eq(workflows.organizationId, ctx.organizationId),
              eq(workflows.id, input.workflowId),
              isNull(workflows.archivedAt),
            ),
          )
          .limit(1);

        if (!wfRow) {
          throw new NotFoundError(
            'Workflow selecionado não encontrado ou inativo nesta organização.',
          );
        }
        workflowId = wfRow.id;
      }

      // 6. Resolve etapa inicial do workflow
      let resolvedStage;
      if (input.stageId) {
        const [st] = await tx
          .select()
          .from(workflowStages)
          .where(
            and(
              eq(workflowStages.organizationId, ctx.organizationId),
              eq(workflowStages.workflowId, workflowId),
              eq(workflowStages.id, input.stageId),
              isNull(workflowStages.archivedAt),
            ),
          )
          .limit(1);
        if (!st) {
          throw new ValidationError(
            'A etapa selecionada não pertence ao workflow do serviço escolhido.',
          );
        }
        resolvedStage = st;
      } else {
        const [firstStage] = await tx
          .select()
          .from(workflowStages)
          .where(
            and(
              eq(workflowStages.organizationId, ctx.organizationId),
              eq(workflowStages.workflowId, workflowId),
              isNull(workflowStages.archivedAt),
            ),
          )
          .orderBy(asc(workflowStages.position))
          .limit(1);
        if (!firstStage) {
          throw new ValidationError('O workflow configurado não possui etapas ativas.');
        }
        resolvedStage = firstStage;
      }

      // 7. Gera número sequencial e código único por organização (ex.: DEM-0001)
      const [maxRow] = await tx
        .select({
          maxNumber: sql<number>`coalesce(max(${demands.number}), 0)::int`,
        })
        .from(demands)
        .where(eq(demands.organizationId, ctx.organizationId));

      const nextNumber = (maxRow?.maxNumber ?? 0) + 1;
      const code = `DEM-${String(nextNumber).padStart(4, '0')}`;
      const statusCategory = resolvedStage.category;
      const completedAt = statusCategory === 'done' ? new Date() : null;

      const [created] = await tx
        .insert(demands)
        .values({
          organizationId: ctx.organizationId,
          number: nextNumber,
          code,
          title: trimmedTitle,
          description: input.description?.trim() || null,
          clientId: input.clientId,
          companyId: input.companyId || null,
          serviceTypeId: resolvedServiceType.id,
          workflowId,
          stageId: resolvedStage.id,
          statusCategory,
          departmentId: input.departmentId,
          assigneeMembershipId: input.assigneeMembershipId || null,
          priority: input.priority ?? 'medium',
          source: 'office',
          dueDate: input.dueDate?.trim() || null,
          completedAt,
          createdByMembershipId: ctx.membershipId,
        })
        .returning();

      // 8. Registra entrada inicial no histórico de etapas (demand_stage_history)
      await tx.insert(demandStageHistory).values({
        organizationId: ctx.organizationId,
        demandId: created!.id,
        fromStageId: null,
        toStageId: resolvedStage.id,
        movedByMembershipId: ctx.membershipId,
        note: 'Abertura da demanda',
      });

      // 9. Registra participantes iniciais, caso informados
      const uniqueParticipants = Array.from(
        new Set((input.participantMembershipIds ?? []).filter(Boolean)),
      );
      for (const partMembershipId of uniqueParticipants) {
        const [validPart] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.organizationId, ctx.organizationId),
              eq(memberships.id, partMembershipId),
              eq(memberships.kind, 'internal'),
            ),
          )
          .limit(1);

        if (validPart) {
          await tx.insert(demandParticipants).values({
            organizationId: ctx.organizationId,
            demandId: created!.id,
            membershipId: partMembershipId,
            role: 'collaborator',
          });
        }
      }

      // 10. Registra auditoria imutável em activity_log
      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'demand.created',
        entityType: 'demand',
        entityId: created!.id,
        changes: {
          code: created!.code,
          title: created!.title,
          clientId: created!.clientId,
          companyId: created!.companyId,
          departmentId: created!.departmentId,
          assigneeMembershipId: created!.assigneeMembershipId,
          workflowId,
          stageId: resolvedStage.id,
          stageName: resolvedStage.name,
          statusCategory: created!.statusCategory,
          priority: created!.priority,
          dueDate: created!.dueDate,
        },
      });

      return {
        id: created!.id,
        number: created!.number,
        code: created!.code,
        title: created!.title,
        statusCategory: created!.statusCategory,
      };
    },
    database,
  );
}

/**
 * Transiciona a etapa (`stageId`) e o status derivado (`statusCategory` — Decisão A6) de uma demanda,
 * validando as regras de transição configuradas (`workflow_transitions`) e gravando o histórico
 * em `demand_stage_history` e no `activity_log` imutável.
 */
export async function transitionDemandStage(
  ctx: OfficeTenantContext,
  input: {
    demandId: string;
    toStageId: string;
    note?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{
  demandId: string;
  fromStageId: string;
  toStageId: string;
  statusCategory: WorkflowStageCategory;
}> {
  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(demands)
        .where(
          and(
            eq(demands.organizationId, ctx.organizationId),
            eq(demands.id, input.demandId),
            isNull(demands.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Demanda não encontrada nesta organização.');
      }

      const partRows = await tx
        .select({ membershipId: demandParticipants.membershipId })
        .from(demandParticipants)
        .where(
          and(
            eq(demandParticipants.organizationId, ctx.organizationId),
            eq(demandParticipants.demandId, existing.id),
          ),
        );

      assertPermission(ctx, 'demand.update', {
        departmentId: existing.departmentId,
        assigneeMembershipId: existing.assigneeMembershipId,
        participantMembershipIds: partRows.map((p) => p.membershipId),
      });

      const [fromStage] = await tx
        .select()
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            eq(workflowStages.id, existing.stageId),
          ),
        )
        .limit(1);

      const [targetStage] = await tx
        .select()
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            eq(workflowStages.workflowId, existing.workflowId),
            eq(workflowStages.id, input.toStageId),
            isNull(workflowStages.archivedAt),
          ),
        )
        .limit(1);

      if (!targetStage) {
        throw new ValidationError(
          'A etapa de destino não existe ou não pertence ao workflow desta demanda.',
        );
      }

      // Valida bloqueios e regras de transição configuradas para esta esteira (workflow_transitions)
      if (existing.stageId !== targetStage.id) {
        const configuredRules = await tx
          .select({
            fromStageId: workflowTransitions.fromStageId,
            toStageId: workflowTransitions.toStageId,
          })
          .from(workflowTransitions)
          .where(
            and(
              eq(workflowTransitions.organizationId, ctx.organizationId),
              eq(workflowTransitions.workflowId, existing.workflowId),
            ),
          );

        if (configuredRules.length > 0) {
          const isAllowed = configuredRules.some(
            (r) => r.fromStageId === existing.stageId && r.toStageId === targetStage.id,
          );
          if (!isAllowed) {
            throw new ValidationError(
              `Transição bloqueada pelas regras desta esteira: a etapa "${fromStage?.name ?? 'Atual'}" não permite movimentação direta para "${targetStage.name}".`,
            );
          }
        }
      }

      const nextStatusCategory = targetStage.category;
      const nextCompletedAt =
        nextStatusCategory === 'done' ? (existing.completedAt ?? new Date()) : null;

      await tx
        .update(demands)
        .set({
          stageId: targetStage.id,
          statusCategory: nextStatusCategory,
          completedAt: nextCompletedAt,
          updatedAt: new Date(),
        })
        .where(eq(demands.id, existing.id));

      await tx.insert(demandStageHistory).values({
        organizationId: ctx.organizationId,
        demandId: existing.id,
        fromStageId: existing.stageId,
        toStageId: targetStage.id,
        movedByMembershipId: ctx.membershipId,
        note: input.note?.trim() || null,
      });

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'demand.stage_transitioned',
        entityType: 'demand',
        entityId: existing.id,
        changes: {
          code: existing.code,
          fromStageId: existing.stageId,
          fromStageName: fromStage?.name ?? null,
          fromStatusCategory: existing.statusCategory,
          toStageId: targetStage.id,
          toStageName: targetStage.name,
          toStatusCategory: nextStatusCategory,
          note: input.note?.trim() || null,
        },
      });

      return {
        demandId: existing.id,
        fromStageId: existing.stageId,
        toStageId: targetStage.id,
        statusCategory: nextStatusCategory,
      };
    },
    database,
  );
}

/**
 * Atualiza os dados operacionais de uma demanda (título, descrição, cliente, empresa,
 * departamento, responsável principal, prioridade e prazo fatal `due_date`).
 */
export async function updateDemand(
  ctx: OfficeTenantContext,
  input: {
    demandId: string;
    title: string;
    description?: string | null;
    clientId: string;
    companyId?: string | null;
    departmentId: string;
    assigneeMembershipId?: string | null;
    priority: DemandPriority;
    dueDate?: string | null;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string; code: string; title: string }> {
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length < 3) {
    throw new ValidationError('O título da demanda deve ter pelo menos 3 caracteres.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(demands)
        .where(
          and(
            eq(demands.organizationId, ctx.organizationId),
            eq(demands.id, input.demandId),
            isNull(demands.archivedAt),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Demanda não encontrada nesta organização.');
      }

      const partRows = await tx
        .select({ membershipId: demandParticipants.membershipId })
        .from(demandParticipants)
        .where(
          and(
            eq(demandParticipants.organizationId, ctx.organizationId),
            eq(demandParticipants.demandId, existing.id),
          ),
        );

      const resourceScope = {
        departmentId: existing.departmentId,
        assigneeMembershipId: existing.assigneeMembershipId,
        participantMembershipIds: partRows.map((p) => p.membershipId),
      };

      assertPermission(ctx, 'demand.update', resourceScope);

      // Se houve alteração de responsável ou de departamento, exige também demand.assign
      const changingAssignment =
        (input.assigneeMembershipId || null) !== existing.assigneeMembershipId ||
        input.departmentId !== existing.departmentId;

      if (changingAssignment) {
        assertPermission(ctx, 'demand.assign', resourceScope);
      }

      // Valida cliente e FK tripla Cliente–Empresa
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
        throw new NotFoundError('Cliente selecionado não encontrado nesta organização.');
      }

      if (input.companyId) {
        const [companyRow] = await tx
          .select({ id: companies.id, clientId: companies.clientId })
          .from(companies)
          .where(
            and(
              eq(companies.organizationId, ctx.organizationId),
              eq(companies.id, input.companyId),
              isNull(companies.archivedAt),
            ),
          )
          .limit(1);

        if (!companyRow) {
          throw new NotFoundError('Empresa selecionada não encontrada nesta organização.');
        }

        if (companyRow.clientId !== input.clientId) {
          throw new ValidationError(
            'A empresa selecionada não pertence ao cliente informado nesta demanda (violação de integridade Cliente–Empresa).',
          );
        }
      }

      const [deptRow] = await tx
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.organizationId, ctx.organizationId),
            eq(departments.id, input.departmentId),
            isNull(departments.archivedAt),
          ),
        )
        .limit(1);

      if (!deptRow) {
        throw new NotFoundError('Departamento responsável não encontrado nesta organização.');
      }

      if (input.assigneeMembershipId) {
        const [assigneeRow] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.organizationId, ctx.organizationId),
              eq(memberships.id, input.assigneeMembershipId),
              eq(memberships.kind, 'internal'),
              eq(memberships.status, 'active'),
            ),
          )
          .limit(1);

        if (!assigneeRow) {
          throw new NotFoundError(
            'Responsável atribuído não encontrado ou inativo nesta organização.',
          );
        }
      }

      const [updated] = await tx
        .update(demands)
        .set({
          title: trimmedTitle,
          description: input.description?.trim() || null,
          clientId: input.clientId,
          companyId: input.companyId || null,
          departmentId: input.departmentId,
          assigneeMembershipId: input.assigneeMembershipId || null,
          priority: input.priority,
          dueDate: input.dueDate?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(demands.id, existing.id))
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'demand.updated',
        entityType: 'demand',
        entityId: existing.id,
        changes: {
          code: existing.code,
          previousTitle: existing.title,
          newTitle: updated!.title,
          previousClientId: existing.clientId,
          newClientId: updated!.clientId,
          previousCompanyId: existing.companyId,
          newCompanyId: updated!.companyId,
          previousDepartmentId: existing.departmentId,
          newDepartmentId: updated!.departmentId,
          previousAssigneeMembershipId: existing.assigneeMembershipId,
          newAssigneeMembershipId: updated!.assigneeMembershipId,
          previousPriority: existing.priority,
          newPriority: updated!.priority,
          previousDueDate: existing.dueDate,
          newDueDate: updated!.dueDate,
        },
      });

      return {
        id: updated!.id,
        code: updated!.code,
        title: updated!.title,
      };
    },
    database,
  );
}

/**
 * Adiciona ou atualiza um participante interno (`collaborator` ou `watcher`) na demanda.
 */
export async function addDemandParticipant(
  ctx: OfficeTenantContext,
  input: {
    demandId: string;
    membershipId: string;
    role?: ParticipantRole;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string }> {
  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existingDemand] = await tx
        .select()
        .from(demands)
        .where(
          and(
            eq(demands.organizationId, ctx.organizationId),
            eq(demands.id, input.demandId),
            isNull(demands.archivedAt),
          ),
        )
        .limit(1);

      if (!existingDemand) {
        throw new NotFoundError('Demanda não encontrada nesta organização.');
      }

      assertPermission(ctx, 'demand.update', {
        departmentId: existingDemand.departmentId,
        assigneeMembershipId: existingDemand.assigneeMembershipId,
      });

      const [memberRow] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, ctx.organizationId),
            eq(memberships.id, input.membershipId),
            eq(memberships.kind, 'internal'),
            eq(memberships.status, 'active'),
          ),
        )
        .limit(1);

      if (!memberRow) {
        throw new NotFoundError('Membro não encontrado ou inativo nesta organização.');
      }

      const [existingPart] = await tx
        .select()
        .from(demandParticipants)
        .where(
          and(
            eq(demandParticipants.organizationId, ctx.organizationId),
            eq(demandParticipants.demandId, existingDemand.id),
            eq(demandParticipants.membershipId, input.membershipId),
          ),
        )
        .limit(1);

      const role = input.role ?? 'collaborator';
      let participantId: string;

      if (!existingPart) {
        const [created] = await tx
          .insert(demandParticipants)
          .values({
            organizationId: ctx.organizationId,
            demandId: existingDemand.id,
            membershipId: input.membershipId,
            role,
          })
          .returning();
        participantId = created!.id;
      } else {
        const [updated] = await tx
          .update(demandParticipants)
          .set({ role })
          .where(eq(demandParticipants.id, existingPart.id))
          .returning();
        participantId = updated!.id;
      }

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'demand.participant_added',
        entityType: 'demand',
        entityId: existingDemand.id,
        changes: {
          code: existingDemand.code,
          membershipId: input.membershipId,
          role,
        },
      });

      return { id: participantId };
    },
    database,
  );
}

/**
 * Remove um participante de uma demanda.
 */
export async function removeDemandParticipant(
  ctx: OfficeTenantContext,
  input: {
    demandId: string;
    membershipId: string;
  },
  database: AnyPgDatabase = getDb(),
): Promise<void> {
  await withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existingDemand] = await tx
        .select()
        .from(demands)
        .where(
          and(
            eq(demands.organizationId, ctx.organizationId),
            eq(demands.id, input.demandId),
            isNull(demands.archivedAt),
          ),
        )
        .limit(1);

      if (!existingDemand) {
        throw new NotFoundError('Demanda não encontrada nesta organização.');
      }

      assertPermission(ctx, 'demand.update', {
        departmentId: existingDemand.departmentId,
        assigneeMembershipId: existingDemand.assigneeMembershipId,
      });

      await tx
        .delete(demandParticipants)
        .where(
          and(
            eq(demandParticipants.organizationId, ctx.organizationId),
            eq(demandParticipants.demandId, existingDemand.id),
            eq(demandParticipants.membershipId, input.membershipId),
          ),
        );

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'demand.participant_removed',
        entityType: 'demand',
        entityId: existingDemand.id,
        changes: {
          code: existingDemand.code,
          membershipId: input.membershipId,
        },
      });
    },
    database,
  );
}

/**
 * Registra um comentário interno na demanda.
 */
export async function addDemandComment(
  ctx: OfficeTenantContext,
  input: {
    demandId: string;
    body: string;
  },
  database: AnyPgDatabase = getDb(),
): Promise<{ id: string }> {
  const trimmedBody = input.body.trim();
  if (trimmedBody.length < 2) {
    throw new ValidationError('O comentário deve conter ao menos 2 caracteres.');
  }

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [existingDemand] = await tx
        .select()
        .from(demands)
        .where(
          and(
            eq(demands.organizationId, ctx.organizationId),
            eq(demands.id, input.demandId),
            isNull(demands.archivedAt),
          ),
        )
        .limit(1);

      if (!existingDemand) {
        throw new NotFoundError('Demanda não encontrada nesta organização.');
      }

      const partRows = await tx
        .select({ membershipId: demandParticipants.membershipId })
        .from(demandParticipants)
        .where(
          and(
            eq(demandParticipants.organizationId, ctx.organizationId),
            eq(demandParticipants.demandId, existingDemand.id),
          ),
        );

      assertPermission(ctx, 'demand.update', {
        departmentId: existingDemand.departmentId,
        assigneeMembershipId: existingDemand.assigneeMembershipId,
        participantMembershipIds: partRows.map((p) => p.membershipId),
      });

      const [created] = await tx
        .insert(comments)
        .values({
          organizationId: ctx.organizationId,
          demandId: existingDemand.id,
          authorMembershipId: ctx.membershipId,
          body: trimmedBody,
          visibility: 'internal',
        })
        .returning();

      await tx.insert(activityLog).values({
        organizationId: ctx.organizationId,
        actorMembershipId: ctx.membershipId,
        action: 'demand.comment_added',
        entityType: 'demand',
        entityId: existingDemand.id,
        changes: {
          code: existingDemand.code,
          commentId: created!.id,
        },
      });

      return { id: created!.id };
    },
    database,
  );
}

/**
 * Busca os detalhes completos de uma demanda (`/[orgSlug]/demandas/[demandId]`):
 * - Dados vinculados (cliente, empresa, serviço, workflow, departamento, responsável).
 * - Participantes da demanda.
 * - Histórico cronológico de transições de etapas (`demand_stage_history`).
 * - Comentários internos (`comments`).
 * - Linha do tempo de auditoria imutável (`activity_log`).
 */
export async function getDemandDetails(
  ctx: OfficeTenantContext,
  demandId: string,
  database: AnyPgDatabase = getDb(),
): Promise<DemandDetailsDTO> {
  const assigneeMemberships = alias(memberships, 'detail_assignee_memberships');
  const assigneeUsers = alias(users, 'detail_assignee_users');
  const creatorMemberships = alias(memberships, 'detail_creator_memberships');
  const creatorUsers = alias(users, 'detail_creator_users');

  return withTenant(
    {
      organizationId: ctx.organizationId,
      actorMembershipId: ctx.membershipId,
    },
    async (tx) => {
      const [row] = await tx
        .select({
          id: demands.id,
          number: demands.number,
          code: demands.code,
          title: demands.title,
          description: demands.description,
          clientId: demands.clientId,
          clientName: clients.name,
          companyId: demands.companyId,
          companyLegalName: companies.legalName,
          companyCnpj: companies.cnpj,
          serviceTypeId: demands.serviceTypeId,
          serviceTypeName: serviceTypes.name,
          serviceCategoryName: serviceCategories.name,
          workflowId: demands.workflowId,
          workflowName: workflows.name,
          stageId: demands.stageId,
          stageName: workflowStages.name,
          statusCategory: demands.statusCategory,
          departmentId: demands.departmentId,
          departmentName: departments.name,
          assigneeMembershipId: demands.assigneeMembershipId,
          assigneeName: assigneeUsers.name,
          assigneeEmail: assigneeUsers.email,
          createdByMembershipId: demands.createdByMembershipId,
          createdByName: creatorUsers.name,
          priority: demands.priority,
          dueDate: demands.dueDate,
          openedAt: demands.openedAt,
          completedAt: demands.completedAt,
          updatedAt: demands.updatedAt,
        })
        .from(demands)
        .innerJoin(
          clients,
          and(eq(clients.organizationId, demands.organizationId), eq(clients.id, demands.clientId)),
        )
        .leftJoin(
          companies,
          and(
            eq(companies.organizationId, demands.organizationId),
            eq(companies.id, demands.companyId),
          ),
        )
        .innerJoin(
          serviceTypes,
          and(
            eq(serviceTypes.organizationId, demands.organizationId),
            eq(serviceTypes.id, demands.serviceTypeId),
          ),
        )
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
            eq(workflows.organizationId, demands.organizationId),
            eq(workflows.id, demands.workflowId),
          ),
        )
        .innerJoin(
          workflowStages,
          and(
            eq(workflowStages.organizationId, demands.organizationId),
            eq(workflowStages.id, demands.stageId),
          ),
        )
        .innerJoin(
          departments,
          and(
            eq(departments.organizationId, demands.organizationId),
            eq(departments.id, demands.departmentId),
          ),
        )
        .leftJoin(
          assigneeMemberships,
          and(
            eq(assigneeMemberships.organizationId, demands.organizationId),
            eq(assigneeMemberships.id, demands.assigneeMembershipId),
          ),
        )
        .leftJoin(assigneeUsers, eq(assigneeUsers.id, assigneeMemberships.userId))
        .innerJoin(
          creatorMemberships,
          and(
            eq(creatorMemberships.organizationId, demands.organizationId),
            eq(creatorMemberships.id, demands.createdByMembershipId),
          ),
        )
        .innerJoin(creatorUsers, eq(creatorUsers.id, creatorMemberships.userId))
        .where(
          and(
            eq(demands.organizationId, ctx.organizationId),
            eq(demands.id, demandId),
            isNull(demands.archivedAt),
          ),
        )
        .limit(1);

      if (!row) {
        throw new NotFoundError('Demanda não encontrada nesta organização.');
      }

      const partRows = await tx
        .select({
          id: demandParticipants.id,
          membershipId: demandParticipants.membershipId,
          userId: users.id,
          name: users.name,
          email: users.email,
          role: demandParticipants.role,
          createdAt: demandParticipants.createdAt,
        })
        .from(demandParticipants)
        .innerJoin(
          memberships,
          and(
            eq(memberships.organizationId, demandParticipants.organizationId),
            eq(memberships.id, demandParticipants.membershipId),
          ),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(demandParticipants.organizationId, ctx.organizationId),
            eq(demandParticipants.demandId, row.id),
          ),
        )
        .orderBy(asc(users.name));

      // Valida acesso de leitura no escopo do departamento/atribuição/participação
      if (
        ctx.role !== 'org_admin' &&
        ctx.role !== 'manager' &&
        !ctx.departmentIds.includes(row.departmentId) &&
        row.assigneeMembershipId !== ctx.membershipId &&
        !partRows.some((p) => p.membershipId === ctx.membershipId)
      ) {
        throw new ForbiddenError(
          'Esta demanda pertence a um departamento fora do seu escopo de visualização.',
        );
      }

      const availableStages = await tx
        .select({
          id: workflowStages.id,
          workflowId: workflowStages.workflowId,
          name: workflowStages.name,
          position: workflowStages.position,
          category: workflowStages.category,
        })
        .from(workflowStages)
        .where(
          and(
            eq(workflowStages.organizationId, ctx.organizationId),
            eq(workflowStages.workflowId, row.workflowId),
            isNull(workflowStages.archivedAt),
          ),
        )
        .orderBy(asc(workflowStages.position));

      const stageNameMap = new Map<string, { name: string; category: WorkflowStageCategory }>();
      for (const st of availableStages) {
        stageNameMap.set(st.id, { name: st.name, category: st.category });
      }

      const configuredTransitions = await tx
        .select({
          fromStageId: workflowTransitions.fromStageId,
          toStageId: workflowTransitions.toStageId,
        })
        .from(workflowTransitions)
        .where(
          and(
            eq(workflowTransitions.organizationId, ctx.organizationId),
            eq(workflowTransitions.workflowId, row.workflowId),
          ),
        );

      const allowedTargetStageIds =
        configuredTransitions.length === 0
          ? availableStages.map((s) => s.id)
          : Array.from(
              new Set([
                row.stageId,
                ...configuredTransitions
                  .filter((r) => r.fromStageId === row.stageId)
                  .map((r) => r.toStageId),
              ]),
            );

      const historyRows = await tx
        .select({
          id: demandStageHistory.id,
          fromStageId: demandStageHistory.fromStageId,
          toStageId: demandStageHistory.toStageId,
          movedByMembershipId: demandStageHistory.movedByMembershipId,
          movedByName: users.name,
          note: demandStageHistory.note,
          movedAt: demandStageHistory.movedAt,
        })
        .from(demandStageHistory)
        .innerJoin(
          memberships,
          and(
            eq(memberships.organizationId, demandStageHistory.organizationId),
            eq(memberships.id, demandStageHistory.movedByMembershipId),
          ),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(demandStageHistory.organizationId, ctx.organizationId),
            eq(demandStageHistory.demandId, row.id),
          ),
        )
        .orderBy(desc(demandStageHistory.movedAt));

      const commentRows = await tx
        .select({
          id: comments.id,
          authorMembershipId: comments.authorMembershipId,
          authorName: users.name,
          authorEmail: users.email,
          body: comments.body,
          visibility: comments.visibility,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .innerJoin(
          memberships,
          and(
            eq(memberships.organizationId, comments.organizationId),
            eq(memberships.id, comments.authorMembershipId),
          ),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(comments.organizationId, ctx.organizationId), eq(comments.demandId, row.id)))
        .orderBy(desc(comments.createdAt));

      const auditRows = await tx
        .select({
          id: activityLog.id,
          action: activityLog.action,
          actorName: users.name,
          changes: activityLog.changes,
          createdAt: activityLog.createdAt,
        })
        .from(activityLog)
        .leftJoin(
          memberships,
          and(
            eq(memberships.organizationId, activityLog.organizationId),
            eq(memberships.id, activityLog.actorMembershipId),
          ),
        )
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(activityLog.organizationId, ctx.organizationId),
            eq(activityLog.entityType, 'demand'),
            eq(activityLog.entityId, row.id),
          ),
        )
        .orderBy(desc(activityLog.createdAt));

      return {
        id: row.id,
        number: row.number,
        code: row.code,
        title: row.title,
        description: row.description,
        clientId: row.clientId,
        clientName: row.clientName,
        companyId: row.companyId,
        companyLegalName: row.companyLegalName ?? null,
        companyCnpj: row.companyCnpj ?? null,
        serviceTypeId: row.serviceTypeId,
        serviceTypeName: row.serviceTypeName,
        serviceCategoryName: row.serviceCategoryName,
        workflowId: row.workflowId,
        workflowName: row.workflowName,
        stageId: row.stageId,
        stageName: row.stageName,
        statusCategory: row.statusCategory,
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        assigneeMembershipId: row.assigneeMembershipId,
        assigneeName: row.assigneeName ?? null,
        assigneeEmail: row.assigneeEmail ?? null,
        createdByMembershipId: row.createdByMembershipId,
        createdByName: row.createdByName,
        priority: row.priority,
        dueDate: row.dueDate,
        openedAt: row.openedAt,
        completedAt: row.completedAt,
        updatedAt: row.updatedAt,
        availableStages,
        allowedTargetStageIds,
        participants: partRows,
        stageHistory: historyRows.map((h) => ({
          id: h.id,
          fromStageId: h.fromStageId,
          fromStageName: h.fromStageId
            ? (stageNameMap.get(h.fromStageId)?.name ?? 'Etapa anterior')
            : null,
          toStageId: h.toStageId,
          toStageName: stageNameMap.get(h.toStageId)?.name ?? 'Etapa atual',
          toStageCategory: stageNameMap.get(h.toStageId)?.category ?? 'active',
          movedByMembershipId: h.movedByMembershipId,
          movedByName: h.movedByName,
          note: h.note,
          movedAt: h.movedAt,
        })),
        comments: commentRows,
        activityTimeline: auditRows.map((a) => ({
          id: a.id,
          action: a.action,
          actorName: a.actorName ?? null,
          changes: (a.changes as Record<string, unknown> | null) ?? null,
          createdAt: a.createdAt,
        })),
      };
    },
    database,
  );
}

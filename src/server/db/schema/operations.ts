import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients, companies } from './clients';
import {
  commentVisibilityEnum,
  deadlineKindEnum,
  deadlineStatusEnum,
  demandPriorityEnum,
  demandSourceEnum,
  documentVisibilityEnum,
  participantRoleEnum,
  taskStatusEnum,
  workflowStageCategoryEnum,
} from './enums';
import { departments, memberships, organizations } from './tenancy';
import { serviceTypes, workflows, workflowStages } from './workflows';

/**
 * Entidade central `demands`:
 * - Possui FK tripla `(organization_id, client_id, company_id) -> companies(organization_id, client_id, id)`
 *   garantindo no banco que a empresa informada pertence ao cliente da demanda (Decisão A2).
 * - Possui FK tripla `(organization_id, workflow_id, stage_id) -> workflow_stages(organization_id, workflow_id, id)`
 *   garantindo que a etapa atual pertence ao workflow da demanda.
 * - `status_category` é derivado da categoria da etapa (Decisão A6).
 * - `due_date` representa o prazo geral de conclusão (Decisão A7).
 */
export const demands = pgTable(
  'demands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    number: integer('number').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    clientId: uuid('client_id').notNull(),
    companyId: uuid('company_id'),
    serviceTypeId: uuid('service_type_id').notNull(),
    workflowId: uuid('workflow_id').notNull(),
    stageId: uuid('stage_id').notNull(),
    statusCategory: workflowStageCategoryEnum('status_category').notNull().default('backlog'),
    departmentId: uuid('department_id').notNull(),
    assigneeMembershipId: uuid('assignee_membership_id'),
    priority: demandPriorityEnum('priority').notNull().default('medium'),
    source: demandSourceEnum('source').notNull().default('office'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    dueDate: date('due_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('demands_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('demands_org_number_unique').on(table.organizationId, table.number),
    uniqueIndex('demands_org_code_unique').on(table.organizationId, table.code),
    index('demands_org_status_idx').on(table.organizationId, table.statusCategory),
    index('demands_org_client_idx').on(table.organizationId, table.clientId),
    index('demands_org_dept_idx').on(table.organizationId, table.departmentId),
    index('demands_org_due_date_idx').on(table.organizationId, table.dueDate),
    foreignKey({
      name: 'demands_client_org_fk',
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'demands_company_client_org_fk',
      columns: [table.organizationId, table.clientId, table.companyId],
      foreignColumns: [companies.organizationId, companies.clientId, companies.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'demands_service_type_org_fk',
      columns: [table.organizationId, table.serviceTypeId],
      foreignColumns: [serviceTypes.organizationId, serviceTypes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'demands_workflow_org_fk',
      columns: [table.organizationId, table.workflowId],
      foreignColumns: [workflows.organizationId, workflows.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'demands_stage_workflow_org_fk',
      columns: [table.organizationId, table.workflowId, table.stageId],
      foreignColumns: [workflowStages.organizationId, workflowStages.workflowId, workflowStages.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'demands_dept_org_fk',
      columns: [table.organizationId, table.departmentId],
      foreignColumns: [departments.organizationId, departments.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'demands_assignee_org_fk',
      columns: [table.organizationId, table.assigneeMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'demands_created_by_org_fk',
      columns: [table.organizationId, table.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('restrict'),
  ],
);

export const demandParticipants = pgTable(
  'demand_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    demandId: uuid('demand_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    role: participantRoleEnum('role').notNull().default('collaborator'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('demand_participants_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('demand_participants_unique').on(
      table.organizationId,
      table.demandId,
      table.membershipId,
    ),
    foreignKey({
      name: 'demand_participants_demand_org_fk',
      columns: [table.organizationId, table.demandId],
      foreignColumns: [demands.organizationId, demands.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'demand_participants_membership_org_fk',
      columns: [table.organizationId, table.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('cascade'),
  ],
);

export const demandStageHistory = pgTable(
  'demand_stage_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    demandId: uuid('demand_id').notNull(),
    fromStageId: uuid('from_stage_id'),
    toStageId: uuid('to_stage_id').notNull(),
    movedByMembershipId: uuid('moved_by_membership_id').notNull(),
    note: text('note'),
    movedAt: timestamp('moved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('demand_stage_history_org_id_unique').on(table.organizationId, table.id),
    index('demand_stage_history_demand_idx').on(table.organizationId, table.demandId),
    foreignKey({
      name: 'demand_stage_history_demand_org_fk',
      columns: [table.organizationId, table.demandId],
      foreignColumns: [demands.organizationId, demands.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'demand_stage_history_from_stage_fk',
      columns: [table.organizationId, table.fromStageId],
      foreignColumns: [workflowStages.organizationId, workflowStages.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'demand_stage_history_to_stage_fk',
      columns: [table.organizationId, table.toStageId],
      foreignColumns: [workflowStages.organizationId, workflowStages.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'demand_stage_history_moved_by_fk',
      columns: [table.organizationId, table.movedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('restrict'),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    demandId: uuid('demand_id').notNull(),
    authorMembershipId: uuid('author_membership_id').notNull(),
    body: text('body').notNull(),
    visibility: commentVisibilityEnum('visibility').notNull().default('internal'),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('comments_org_id_unique').on(table.organizationId, table.id),
    index('comments_demand_idx').on(table.organizationId, table.demandId),
    foreignKey({
      name: 'comments_demand_org_fk',
      columns: [table.organizationId, table.demandId],
      foreignColumns: [demands.organizationId, demands.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'comments_author_org_fk',
      columns: [table.organizationId, table.authorMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('restrict'),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    demandId: uuid('demand_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    assigneeMembershipId: uuid('assignee_membership_id'),
    dueDate: date('due_date'),
    status: taskStatusEnum('status').notNull().default('todo'),
    position: integer('position').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedByMembershipId: uuid('completed_by_membership_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('tasks_org_id_unique').on(table.organizationId, table.id),
    unique('tasks_org_demand_id_unique').on(table.organizationId, table.demandId, table.id),
    index('tasks_demand_idx').on(table.organizationId, table.demandId),
    foreignKey({
      name: 'tasks_demand_org_fk',
      columns: [table.organizationId, table.demandId],
      foreignColumns: [demands.organizationId, demands.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'tasks_assignee_org_fk',
      columns: [table.organizationId, table.assigneeMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'tasks_completed_by_org_fk',
      columns: [table.organizationId, table.completedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('set null'),
  ],
);

export const deadlines = pgTable(
  'deadlines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    demandId: uuid('demand_id').notNull(),
    taskId: uuid('task_id'),
    kind: deadlineKindEnum('kind').notNull().default('internal'),
    title: text('title').notNull(),
    dueDate: date('due_date').notNull(),
    dueTime: time('due_time'),
    status: deadlineStatusEnum('status').notNull().default('pending'),
    alertDaysBefore: integer('alert_days_before')
      .array()
      .notNull()
      .default(sql`ARRAY[3, 1]::integer[]`),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('deadlines_org_id_unique').on(table.organizationId, table.id),
    index('deadlines_org_due_date_idx').on(table.organizationId, table.dueDate),
    foreignKey({
      name: 'deadlines_demand_org_fk',
      columns: [table.organizationId, table.demandId],
      foreignColumns: [demands.organizationId, demands.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'deadlines_task_demand_org_fk',
      columns: [table.organizationId, table.demandId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.demandId, tasks.id],
    }).onDelete('set null'),
  ],
);

export const documentCategories = pgTable(
  'document_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('document_categories_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('document_categories_org_name_unique').on(table.organizationId, table.name),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    categoryId: uuid('category_id'),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    visibility: documentVisibilityEnum('visibility').notNull().default('internal'),
    clientId: uuid('client_id'),
    companyId: uuid('company_id'),
    demandId: uuid('demand_id'),
    uploadedByMembershipId: uuid('uploaded_by_membership_id').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('documents_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('documents_storage_key_unique').on(table.storageKey),
    index('documents_org_demand_idx').on(table.organizationId, table.demandId),
    index('documents_org_client_idx').on(table.organizationId, table.clientId),
    check(
      'documents_at_least_one_target_check',
      sql`${table.clientId} IS NOT NULL OR ${table.companyId} IS NOT NULL OR ${table.demandId} IS NOT NULL`,
    ),
    foreignKey({
      name: 'documents_category_org_fk',
      columns: [table.organizationId, table.categoryId],
      foreignColumns: [documentCategories.organizationId, documentCategories.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'documents_client_org_fk',
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'documents_company_org_fk',
      columns: [table.organizationId, table.companyId],
      foreignColumns: [companies.organizationId, companies.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'documents_demand_org_fk',
      columns: [table.organizationId, table.demandId],
      foreignColumns: [demands.organizationId, demands.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'documents_uploaded_by_org_fk',
      columns: [table.organizationId, table.uploadedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('restrict'),
  ],
);

/**
 * `activity_log` (Append-Only):
 * Registra mutações operacionais na mesma transação.
 * A role `legaas_app` não possui permissão de UPDATE ou DELETE nesta tabela.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    actorMembershipId: uuid('actor_membership_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    demandId: uuid('demand_id'),
    changes: jsonb('changes').$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('activity_log_org_id_unique').on(table.organizationId, table.id),
    index('activity_log_org_created_idx').on(table.organizationId, table.createdAt),
    index('activity_log_org_entity_idx').on(table.organizationId, table.entityType, table.entityId),
    foreignKey({
      name: 'activity_log_actor_org_fk',
      columns: [table.organizationId, table.actorMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'activity_log_demand_org_fk',
      columns: [table.organizationId, table.demandId],
      foreignColumns: [demands.organizationId, demands.id],
    }).onDelete('set null'),
  ],
);

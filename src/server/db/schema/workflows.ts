import {
  boolean,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workflowStageCategoryEnum } from './enums';
import { departments, organizations } from './tenancy';

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('service_categories_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('service_categories_org_name_unique').on(table.organizationId, table.name),
  ],
);

export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('workflows_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('workflows_org_name_unique').on(table.organizationId, table.name),
  ],
);

export const workflowStages = pgTable(
  'workflow_stages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    workflowId: uuid('workflow_id').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    category: workflowStageCategoryEnum('category').notNull().default('active'),
    clientVisible: boolean('client_visible').notNull().default(true),
    clientLabel: text('client_label'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('workflow_stages_org_id_unique').on(table.organizationId, table.id),
    unique('workflow_stages_org_workflow_id_unique').on(
      table.organizationId,
      table.workflowId,
      table.id,
    ),
    foreignKey({
      name: 'workflow_stages_workflow_org_fk',
      columns: [table.organizationId, table.workflowId],
      foreignColumns: [workflows.organizationId, workflows.id],
    }).onDelete('cascade'),
  ],
);

export const workflowTransitions = pgTable(
  'workflow_transitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    workflowId: uuid('workflow_id').notNull(),
    fromStageId: uuid('from_stage_id').notNull(),
    toStageId: uuid('to_stage_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('workflow_transitions_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('workflow_transitions_unique').on(
      table.organizationId,
      table.workflowId,
      table.fromStageId,
      table.toStageId,
    ),
    foreignKey({
      name: 'workflow_transitions_from_stage_fk',
      columns: [table.organizationId, table.workflowId, table.fromStageId],
      foreignColumns: [workflowStages.organizationId, workflowStages.workflowId, workflowStages.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'workflow_transitions_to_stage_fk',
      columns: [table.organizationId, table.workflowId, table.toStageId],
      foreignColumns: [workflowStages.organizationId, workflowStages.workflowId, workflowStages.id],
    }).onDelete('cascade'),
  ],
);

export const serviceTypes = pgTable(
  'service_types',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    defaultDepartmentId: uuid('default_department_id'),
    defaultWorkflowId: uuid('default_workflow_id').notNull(),
    defaultDueDays: integer('default_due_days'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('service_types_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('service_types_org_name_unique').on(table.organizationId, table.name),
    foreignKey({
      name: 'service_types_category_org_fk',
      columns: [table.organizationId, table.categoryId],
      foreignColumns: [serviceCategories.organizationId, serviceCategories.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'service_types_dept_org_fk',
      columns: [table.organizationId, table.defaultDepartmentId],
      foreignColumns: [departments.organizationId, departments.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'service_types_workflow_org_fk',
      columns: [table.organizationId, table.defaultWorkflowId],
      foreignColumns: [workflows.organizationId, workflows.id],
    }).onDelete('restrict'),
  ],
);

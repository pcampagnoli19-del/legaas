import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  departmentRoleEnum,
  membershipKindEnum,
  membershipRoleEnum,
  membershipStatusEnum,
  organizationStatusEnum,
} from './enums';
import { users } from './identity';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: organizationStatusEnum('status').notNull().default('active'),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: membershipKindEnum('kind').notNull().default('internal'),
    role: membershipRoleEnum('role').notNull().default('analyst'),
    status: membershipStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('memberships_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('memberships_org_user_unique').on(table.organizationId, table.userId),
    index('memberships_user_id_idx').on(table.userId),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    kind: membershipKindEnum('kind').notNull().default('internal'),
    role: membershipRoleEnum('role').notNull().default('analyst'),
    tokenHash: text('token_hash').notNull(),
    invitedByMembershipId: uuid('invited_by_membership_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('invitations_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('invitations_token_hash_unique').on(table.tokenHash),
    foreignKey({
      name: 'invitations_invited_by_org_fk',
      columns: [table.organizationId, table.invitedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('restrict'),
  ],
);

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('departments_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('departments_org_name_unique').on(table.organizationId, table.name),
  ],
);

export const departmentMembers = pgTable(
  'department_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    departmentId: uuid('department_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    role: departmentRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('department_members_org_id_unique').on(table.organizationId, table.id),
    uniqueIndex('department_members_unique').on(
      table.organizationId,
      table.departmentId,
      table.membershipId,
    ),
    foreignKey({
      name: 'department_members_dept_org_fk',
      columns: [table.organizationId, table.departmentId],
      foreignColumns: [departments.organizationId, departments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'department_members_membership_org_fk',
      columns: [table.organizationId, table.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('cascade'),
  ],
);

export const orgCounters = pgTable(
  'org_counters',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    counterKey: text('counter_key').notNull(),
    currentValue: integer('current_value').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'org_counters_pk',
      columns: [table.organizationId, table.counterKey],
    }),
  ],
);

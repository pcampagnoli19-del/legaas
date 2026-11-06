import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clientTypeEnum, entityStatusEnum } from './enums';
import { users } from './identity';
import { memberships, organizations } from './tenancy';

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    type: clientTypeEnum('type').notNull().default('organization'),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    status: entityStatusEnum('status').notNull().default('active'),
    notes: text('notes'),
    ownerMembershipId: uuid('owner_membership_id'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('clients_org_id_unique').on(table.organizationId, table.id),
    index('clients_org_name_idx').on(table.organizationId, table.name),
    foreignKey({
      name: 'clients_owner_membership_org_fk',
      columns: [table.organizationId, table.ownerMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('set null'),
  ],
);

export const clientContacts = pgTable(
  'client_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    position: text('position'),
    isPrimary: boolean('is_primary').notNull().default(false),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('client_contacts_org_id_unique').on(table.organizationId, table.id),
    index('client_contacts_client_idx').on(table.organizationId, table.clientId),
    foreignKey({
      name: 'client_contacts_client_org_fk',
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete('cascade'),
  ],
);

/**
 * Entidade `companies` (Decisão A2):
 * - Relação 1:N com `clients` (`client_id NOT NULL`).
 * - Suporte a grupos empresariais via `parent_company_id` (FK composta na mesma organização).
 * - Constraint `UNIQUE (organization_id, client_id, id)` habilita a FK tripla em `demands`,
 *   impedindo no banco que uma demanda associe uma empresa que não pertence ao cliente da demanda.
 */
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    parentCompanyId: uuid('parent_company_id'),
    cnpj: text('cnpj').notNull(),
    legalName: text('legal_name').notNull(),
    tradeName: text('trade_name'),
    stateRegistration: text('state_registration'),
    municipalRegistration: text('municipal_registration'),
    addressStreet: text('address_street'),
    addressNumber: text('address_number'),
    addressComplement: text('address_complement'),
    addressDistrict: text('address_district'),
    addressCity: text('address_city'),
    addressState: text('address_state'),
    addressZipCode: text('address_zip_code'),
    status: entityStatusEnum('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('companies_org_id_unique').on(table.organizationId, table.id),
    unique('companies_org_client_id_unique').on(table.organizationId, table.clientId, table.id),
    uniqueIndex('companies_org_cnpj_unique').on(table.organizationId, table.cnpj),
    index('companies_org_client_idx').on(table.organizationId, table.clientId),
    foreignKey({
      name: 'companies_client_org_fk',
      columns: [table.organizationId, table.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'companies_parent_org_fk',
      columns: [table.organizationId, table.parentCompanyId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete('set null'),
  ],
);

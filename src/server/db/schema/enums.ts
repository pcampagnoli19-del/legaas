import { pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);

export const organizationStatusEnum = pgEnum('organization_status', [
  'active',
  'suspended',
  'archived',
]);

export const membershipKindEnum = pgEnum('membership_kind', ['internal', 'external']);

export const membershipRoleEnum = pgEnum('membership_role', [
  'org_admin',
  'manager',
  'coordinator',
  'analyst',
  'viewer',
  'external',
]);

export const membershipStatusEnum = pgEnum('membership_status', ['invited', 'active', 'disabled']);

export const departmentRoleEnum = pgEnum('department_role', ['member', 'coordinator', 'manager']);

export const clientTypeEnum = pgEnum('client_type', ['individual', 'organization']);

export const entityStatusEnum = pgEnum('entity_status', ['active', 'inactive']);

export const workflowStageCategoryEnum = pgEnum('workflow_stage_category', [
  'backlog',
  'active',
  'waiting',
  'done',
  'cancelled',
]);

export const demandPriorityEnum = pgEnum('demand_priority', ['low', 'medium', 'high', 'urgent']);

export const demandSourceEnum = pgEnum('demand_source', ['office', 'portal']);

export const participantRoleEnum = pgEnum('participant_role', ['collaborator', 'watcher']);

export const commentVisibilityEnum = pgEnum('comment_visibility', ['internal', 'external']);

export const taskStatusEnum = pgEnum('task_status', ['todo', 'in_progress', 'done', 'cancelled']);

export const deadlineKindEnum = pgEnum('deadline_kind', [
  'internal',
  'external',
  'contractual',
  'legal',
]);

export const deadlineStatusEnum = pgEnum('deadline_status', ['pending', 'met', 'missed', 'waived']);

export const documentVisibilityEnum = pgEnum('document_visibility', ['internal', 'shared']);

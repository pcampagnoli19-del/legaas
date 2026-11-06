import type { OfficeTenantContext } from '@/server/context/tenant-context';
import { ForbiddenError } from '@/server/errors/app-error';

export type PermissionAction =
  | 'member.read'
  | 'member.invite'
  | 'member.update_role'
  | 'member.deactivate'
  | 'department.read'
  | 'department.create'
  | 'department.update'
  | 'department.assign_member'
  | 'client.read'
  | 'client.write'
  | 'company.read'
  | 'company.write'
  | 'workflow.read'
  | 'workflow.write'
  | 'demand.read'
  | 'demand.create'
  | 'demand.update'
  | 'demand.assign'
  | 'task.read'
  | 'task.write'
  | 'deadline.read'
  | 'deadline.write'
  | 'document.read'
  | 'document.write';

export interface ScopedResource {
  departmentId?: string | null;
  assigneeMembershipId?: string | null;
  participantMembershipIds?: string[];
  targetMembershipId?: string;
}

export type DepartmentScopeFilter =
  { mode: 'all' } | { mode: 'scoped'; departmentIds: string[]; membershipId: string };

const ADMIN_ONLY_ACTIONS = new Set<PermissionAction>([
  'member.invite',
  'member.update_role',
  'member.deactivate',
  'department.create',
  'department.update',
  'department.assign_member',
  'workflow.write',
]);

const READ_ACTIONS = new Set<PermissionAction>([
  'member.read',
  'department.read',
  'client.read',
  'company.read',
  'workflow.read',
  'demand.read',
  'task.read',
  'deadline.read',
  'document.read',
]);

function isResourceInDepartmentOrAssigned(
  ctx: OfficeTenantContext,
  resource?: ScopedResource,
): boolean {
  if (!resource) {
    return ctx.departmentIds.length > 0;
  }

  const inDepartment =
    Boolean(resource.departmentId) && ctx.departmentIds.includes(resource.departmentId!);

  const isAssignee =
    Boolean(resource.assigneeMembershipId) && resource.assigneeMembershipId === ctx.membershipId;

  const isParticipant = Boolean(resource.participantMembershipIds?.includes(ctx.membershipId));

  return inDepartment || isAssignee || isParticipant;
}

/**
 * Motor central de autorização RBAC com escopo por departamento (Decisão A5):
 * - Nunca confia em dados do cliente; avalia sempre `OfficeTenantContext` resolvido no servidor.
 * - `org_admin`: controle integral na organização (exceto auto-desativação para evitar lockout).
 * - `manager`: leitura e escrita em toda a operação da organização; sem mutações administrativas de usuários/departamentos.
 * - `coordinator`: leitura e escrita operacional restritas aos departamentos que integra (`ctx.departmentIds`).
 * - `analyst`: leitura nos seus departamentos ou demandas/tarefas atribuídas; escrita onde é responsável/participante ou dentro do seu departamento.
 * - `viewer`: exclusivamente leitura (`*.read`) restrita aos seus departamentos.
 */
export function can(
  ctx: OfficeTenantContext | null | undefined,
  action: PermissionAction,
  resource?: ScopedResource,
): boolean {
  if (!ctx || ctx.kind !== 'internal') {
    return false;
  }

  // Impede que um administrador desative ou rebaixe a própria conta ativa (proteção contra lockout)
  if (
    (action === 'member.deactivate' || action === 'member.update_role') &&
    resource?.targetMembershipId &&
    resource.targetMembershipId === ctx.membershipId
  ) {
    return false;
  }

  if (ctx.role === 'org_admin') {
    return true;
  }

  if (ADMIN_ONLY_ACTIONS.has(action)) {
    return false;
  }

  if (ctx.role === 'manager') {
    return true;
  }

  // Perfis básicos sempre podem consultar diretório interno de membros, departamentos, clientes, empresas e workflows da organização
  if (
    action === 'member.read' ||
    action === 'department.read' ||
    action === 'client.read' ||
    action === 'company.read' ||
    action === 'workflow.read'
  ) {
    return true;
  }

  if (ctx.role === 'viewer') {
    if (!READ_ACTIONS.has(action)) {
      return false;
    }
    return isResourceInDepartmentOrAssigned(ctx, resource);
  }

  if (ctx.role === 'coordinator') {
    if (!resource?.departmentId) {
      return ctx.departmentIds.length > 0;
    }
    return ctx.departmentIds.includes(resource.departmentId);
  }

  if (ctx.role === 'analyst') {
    if (action === 'demand.assign') {
      return false;
    }
    if (READ_ACTIONS.has(action)) {
      return isResourceInDepartmentOrAssigned(ctx, resource);
    }
    // Mutação por analista: exige pertencer ao departamento ou ser o responsável/participante
    if (resource?.assigneeMembershipId) {
      return (
        resource.assigneeMembershipId === ctx.membershipId ||
        Boolean(resource.participantMembershipIds?.includes(ctx.membershipId))
      );
    }
    return isResourceInDepartmentOrAssigned(ctx, resource);
  }

  return false;
}

/**
 * Valida a permissão no servidor e lança `ForbiddenError` (403) caso negada.
 */
export function assertPermission(
  ctx: OfficeTenantContext | null | undefined,
  action: PermissionAction,
  resource?: ScopedResource,
): void {
  if (!can(ctx, action, resource)) {
    throw new ForbiddenError(
      'Seu perfil de acesso não possui permissão para realizar esta operação.',
    );
  }
}

/**
 * Retorna o filtro de escopo para listagens operacionais (Mitigação do Risco R2):
 * `org_admin` e `manager` enxergam toda a organização; demais perfis são filtrados
 * pelos seus `departmentIds` ou vínculo direto (`membershipId`).
 */
export function getOperationalScopeFilter(ctx: OfficeTenantContext): DepartmentScopeFilter {
  if (ctx.role === 'org_admin' || ctx.role === 'manager') {
    return { mode: 'all' };
  }
  return {
    mode: 'scoped',
    departmentIds: ctx.departmentIds,
    membershipId: ctx.membershipId,
  };
}

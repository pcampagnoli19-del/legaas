import { describe, expect, it } from 'vitest';
import { assertPermission, can, getOperationalScopeFilter } from '@/server/authz/permissions';
import type { OfficeTenantContext } from '@/server/context/tenant-context';
import { ForbiddenError } from '@/server/errors/app-error';

const baseCtx: OfficeTenantContext = {
  userId: '01950000-0000-7000-8000-000000000001',
  organizationId: '01950000-0000-7000-8000-000000000010',
  orgName: 'Vértice Paralegal',
  orgSlug: 'vertice-paralegal',
  orgTimezone: 'America/Sao_Paulo',
  membershipId: '01950000-0000-7000-8000-000000000100',
  role: 'org_admin',
  kind: 'internal',
  departmentIds: ['dept-societario'],
};

describe('Motor de Autorização RBAC com Escopo por Departamento (src/server/authz)', () => {
  it('permite todas as ações administrativas ao org_admin, mas bloqueia auto-desativação', () => {
    expect(can(baseCtx, 'member.invite')).toBe(true);
    expect(can(baseCtx, 'department.create')).toBe(true);
    expect(can(baseCtx, 'member.deactivate', { targetMembershipId: 'outro-membro' })).toBe(true);

    // Impede que o org_admin desative ou rebaixe a própria membership
    expect(can(baseCtx, 'member.deactivate', { targetMembershipId: baseCtx.membershipId })).toBe(
      false,
    );
    expect(can(baseCtx, 'member.update_role', { targetMembershipId: baseCtx.membershipId })).toBe(
      false,
    );
  });

  it('restringe ações de gestão de membros e departamentos para manager (Decisão A5)', () => {
    const managerCtx: OfficeTenantContext = { ...baseCtx, role: 'manager' };

    expect(can(managerCtx, 'member.invite')).toBe(false);
    expect(can(managerCtx, 'department.create')).toBe(false);
    expect(can(managerCtx, 'demand.create')).toBe(true);
    expect(can(managerCtx, 'demand.update', { departmentId: 'dept-outro' })).toBe(true);
    expect(getOperationalScopeFilter(managerCtx)).toEqual({ mode: 'all' });
  });

  it('aplica escopo por departamento para coordinator, analyst e viewer', () => {
    const coordCtx: OfficeTenantContext = {
      ...baseCtx,
      role: 'coordinator',
      departmentIds: ['dept-societario'],
    };

    expect(can(coordCtx, 'demand.update', { departmentId: 'dept-societario' })).toBe(true);
    expect(can(coordCtx, 'demand.update', { departmentId: 'dept-contencioso' })).toBe(false);

    const analystCtx: OfficeTenantContext = {
      ...baseCtx,
      role: 'analyst',
      departmentIds: ['dept-societario'],
    };

    expect(can(analystCtx, 'demand.assign')).toBe(false);
    expect(
      can(analystCtx, 'task.write', {
        departmentId: 'dept-societario',
        assigneeMembershipId: analystCtx.membershipId,
      }),
    ).toBe(true);
    expect(
      can(analystCtx, 'task.write', {
        departmentId: 'dept-societario',
        assigneeMembershipId: 'outro-analista',
      }),
    ).toBe(false);

    const viewerCtx: OfficeTenantContext = {
      ...baseCtx,
      role: 'viewer',
      departmentIds: ['dept-societario'],
    };

    expect(can(viewerCtx, 'demand.read', { departmentId: 'dept-societario' })).toBe(true);
    expect(can(viewerCtx, 'demand.read', { departmentId: 'dept-contencioso' })).toBe(false);
    expect(can(viewerCtx, 'demand.update', { departmentId: 'dept-societario' })).toBe(false);

    expect(() =>
      assertPermission(viewerCtx, 'demand.update', { departmentId: 'dept-societario' }),
    ).toThrow(ForbiddenError);
  });
});

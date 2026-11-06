import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authenticateWithEmailPassword } from '@/server/auth/service';
import { getValidatedSessionByToken } from '@/server/auth/session';
import { getOperationalScopeFilter } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/errors/app-error';
import {
  assignMemberToDepartment,
  createDepartment,
  listOrganizationDepartments,
  removeMemberFromDepartment,
  updateDepartment,
} from '@/server/modules/departments/service';
import {
  inviteOrganizationMember,
  listOrganizationMembers,
  revokeOrganizationInvitation,
  setOrganizationMemberStatus,
  updateOrganizationMemberRole,
} from '@/server/modules/members/service';
import { acceptInvitation, provisionOrganization } from '@/server/modules/organizations/service';
import { createTestDatabase, type TestDatabaseHandle } from '../setup/test-db';

describe('Fase 1.2 e 1.3 — Gestão de Membros, Permissões RBAC, Departamentos e Isolamento Multi-Tenant', () => {
  let handle: TestDatabaseHandle;

  beforeAll(async () => {
    handle = await createTestDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('executa o ciclo completo de convites, papéis, desativação de membros com revogação de sessão e departamentos em isolamento multi-tenant', async () => {
    // 1. Provisiona Organização A e aceita convite do org_admin
    const orgA = await provisionOrganization(
      {
        name: 'Atlas Paralegal & Societário',
        slug: 'atlas-paralegal',
        adminEmail: 'admin@atlas.leg.br',
      },
      handle.db,
    );

    const adminAccepted = await acceptInvitation(
      {
        rawToken: orgA.rawInviteToken,
        name: 'Admin Atlas',
        password: 'AdminPassword!123',
      },
      handle.db,
    );

    const adminCtx = await resolveOfficeTenantContext(
      {
        userId: adminAccepted.userId,
        orgSlug: 'atlas-paralegal',
      },
      handle.db,
    );

    expect(adminCtx.role).toBe('org_admin');

    // Convidar um e-mail que já é membro ativo deve falhar com ConflictError (409)
    await expect(
      inviteOrganizationMember(
        adminCtx,
        {
          email: 'admin@atlas.leg.br',
          role: 'manager',
        },
        handle.db,
      ),
    ).rejects.toThrow(ConflictError);

    // 2. Convida um Gestor (manager) e uma Analista (analyst)
    const managerInvite = await inviteOrganizationMember(
      adminCtx,
      {
        email: 'gestor@atlas.leg.br',
        role: 'manager',
      },
      handle.db,
    );

    const analystInvite = await inviteOrganizationMember(
      adminCtx,
      {
        email: 'analista@atlas.leg.br',
        role: 'analyst',
      },
      handle.db,
    );

    const tempInvite = await inviteOrganizationMember(
      adminCtx,
      {
        email: 'temporario@atlas.leg.br',
        role: 'viewer',
      },
      handle.db,
    );

    // Lista diretório antes do aceite: 1 membro ativo + 3 convites pendentes
    const dirBefore = await listOrganizationMembers(adminCtx, handle.db);
    expect(dirBefore.members).toHaveLength(1);
    expect(dirBefore.pendingInvitations).toHaveLength(3);

    // Revoga o convite temporário
    await revokeOrganizationInvitation(
      adminCtx,
      { invitationId: tempInvite.invitationId },
      handle.db,
    );
    const dirAfterRevoke = await listOrganizationMembers(adminCtx, handle.db);
    expect(dirAfterRevoke.pendingInvitations).toHaveLength(2);

    // 3. Gestor e Analista aceitam seus convites
    const managerAccepted = await acceptInvitation(
      {
        rawToken: managerInvite.rawInviteToken,
        name: 'Roberto Gestor',
        password: 'ManagerPassword!123',
      },
      handle.db,
    );

    const analystAccepted = await acceptInvitation(
      {
        rawToken: analystInvite.rawInviteToken,
        name: 'Camila Analista',
        password: 'AnalystPassword!123',
      },
      handle.db,
    );

    const managerCtx = await resolveOfficeTenantContext(
      {
        userId: managerAccepted.userId,
        orgSlug: 'atlas-paralegal',
      },
      handle.db,
    );
    const analystCtx = await resolveOfficeTenantContext(
      {
        userId: analystAccepted.userId,
        orgSlug: 'atlas-paralegal',
      },
      handle.db,
    );

    expect(managerCtx.role).toBe('manager');
    expect(analystCtx.role).toBe('analyst');

    // 4. Valida proteção RBAC no backend: Gestor e Analista NÃO podem convidar membros, alterar papéis ou criar departamentos
    await expect(
      inviteOrganizationMember(
        managerCtx,
        { email: 'intruso@atlas.leg.br', role: 'viewer' },
        handle.db,
      ),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      updateOrganizationMemberRole(
        managerCtx,
        { targetMembershipId: analystCtx.membershipId, newRole: 'coordinator' },
        handle.db,
      ),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      setOrganizationMemberStatus(
        managerCtx,
        { targetMembershipId: analystCtx.membershipId, status: 'disabled' },
        handle.db,
      ),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      createDepartment(managerCtx, { name: 'Departamento Não Autorizado' }, handle.db),
    ).rejects.toThrow(ForbiddenError);

    // 5. Proteção contra auto-bloqueio: org_admin não pode rebaixar nem desativar a própria conta
    await expect(
      updateOrganizationMemberRole(
        adminCtx,
        { targetMembershipId: adminCtx.membershipId, newRole: 'viewer' },
        handle.db,
      ),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      setOrganizationMemberStatus(
        adminCtx,
        { targetMembershipId: adminCtx.membershipId, status: 'disabled' },
        handle.db,
      ),
    ).rejects.toThrow(ForbiddenError);

    // 6. Cria e edita Departamentos (Fase 1.3) e associa membros, coordenadores e gestores
    const deptSocietario = await createDepartment(
      adminCtx,
      {
        name: 'Societário',
        description: 'Constituição, alterações e atas societárias',
      },
      handle.db,
    );

    const deptLicencas = await createDepartment(
      adminCtx,
      {
        name: 'Alvarás e Licenças',
        description: 'Licenciamento municipal, estadual e federal',
      },
      handle.db,
    );

    // Nome duplicado na mesma organização deve ser rejeitado (case-insensitive)
    await expect(createDepartment(adminCtx, { name: 'societário' }, handle.db)).rejects.toThrow(
      ConflictError,
    );

    // Atualiza nome e descrição do departamento
    const updatedSocietario = await updateDepartment(
      adminCtx,
      {
        departmentId: deptSocietario.id,
        name: 'Societário e M&A',
        description: 'Operações societárias e reestruturações',
      },
      handle.db,
    );
    expect(updatedSocietario.name).toBe('Societário e M&A');

    // Vincula Roberto como manager de Societário e Camila como member de Societário e coordinator de Licenças
    await assignMemberToDepartment(
      adminCtx,
      {
        departmentId: deptSocietario.id,
        membershipId: managerCtx.membershipId,
        departmentRole: 'manager',
      },
      handle.db,
    );

    await assignMemberToDepartment(
      adminCtx,
      {
        departmentId: deptSocietario.id,
        membershipId: analystCtx.membershipId,
        departmentRole: 'member',
      },
      handle.db,
    );

    await assignMemberToDepartment(
      adminCtx,
      {
        departmentId: deptLicencas.id,
        membershipId: analystCtx.membershipId,
        departmentRole: 'coordinator',
      },
      handle.db,
    );

    // Verifica que resolveOfficeTenantContext carrega os departmentIds atribuídos
    const refreshedAnalystCtx = await resolveOfficeTenantContext(
      {
        userId: analystAccepted.userId,
        orgSlug: 'atlas-paralegal',
      },
      handle.db,
    );
    expect(refreshedAnalystCtx.departmentIds).toEqual(
      expect.arrayContaining([deptSocietario.id, deptLicencas.id]),
    );
    const scopeFilter = getOperationalScopeFilter(refreshedAnalystCtx);
    expect(scopeFilter.mode).toBe('scoped');
    if (scopeFilter.mode === 'scoped') {
      expect(scopeFilter.departmentIds).toHaveLength(2);
    }

    // Remove Camila do departamento de Licenças
    await removeMemberFromDepartment(
      adminCtx,
      {
        departmentId: deptLicencas.id,
        membershipId: analystCtx.membershipId,
      },
      handle.db,
    );

    const deptsAfterRemove = await listOrganizationDepartments(adminCtx, handle.db);
    const licencasDto = deptsAfterRemove.find((d) => d.id === deptLicencas.id);
    expect(licencasDto?.participants).toHaveLength(0);

    // 7. Atualiza o papel organizacional de Camila para coordinator e depois desativa seu acesso
    const roleUpdate = await updateOrganizationMemberRole(
      adminCtx,
      {
        targetMembershipId: analystCtx.membershipId,
        newRole: 'coordinator',
      },
      handle.db,
    );
    expect(roleUpdate.role).toBe('coordinator');

    // Autentica Camila para obter uma sessão ativa e verificar revogação imediata na desativação
    const analystLogin = await authenticateWithEmailPassword(
      {
        email: 'analista@atlas.leg.br',
        password: 'AnalystPassword!123',
      },
      handle.db,
    );

    const sessionBeforeDisable = await getValidatedSessionByToken(
      analystLogin.rawSessionToken,
      handle.db,
    );
    expect(sessionBeforeDisable).not.toBeNull();

    // Desativa Camila -> deve revogar todas as sessões ativas dela imediatamente
    await setOrganizationMemberStatus(
      adminCtx,
      {
        targetMembershipId: analystCtx.membershipId,
        status: 'disabled',
      },
      handle.db,
    );

    const sessionAfterDisable = await getValidatedSessionByToken(
      analystLogin.rawSessionToken,
      handle.db,
    );
    expect(sessionAfterDisable).toBeNull();

    await expect(
      resolveOfficeTenantContext(
        {
          userId: analystAccepted.userId,
          orgSlug: 'atlas-paralegal',
        },
        handle.db,
      ),
    ).rejects.toThrow(NotFoundError);

    // 8. Isolamento Multi-Tenant Estrito entre Organização A e Organização B
    const orgB = await provisionOrganization(
      {
        name: 'Boreal Jurídico',
        slug: 'boreal-juridico',
        adminEmail: 'admin@boreal.leg.br',
      },
      handle.db,
    );
    const adminBAccepted = await acceptInvitation(
      {
        rawToken: orgB.rawInviteToken,
        name: 'Admin Boreal',
        password: 'BorealPassword!123',
      },
      handle.db,
    );
    const adminBCtx = await resolveOfficeTenantContext(
      {
        userId: adminBAccepted.userId,
        orgSlug: 'boreal-juridico',
      },
      handle.db,
    );

    // Organização B pode criar um departamento com o mesmo nome da Organização A
    const deptBoreal = await createDepartment(adminBCtx, { name: 'Societário e M&A' }, handle.db);
    expect(deptBoreal.name).toBe('Societário e M&A');

    // Admin da Organização B não enxerga membros nem departamentos da Organização A
    const orgBMembers = await listOrganizationMembers(adminBCtx, handle.db);
    expect(orgBMembers.members).toHaveLength(1);
    expect(orgBMembers.members[0]?.email).toBe('admin@boreal.leg.br');

    // Admin da Organização B tentando alterar membro ou departamento da Organização A recebe 404 (isolado por RLS)
    await expect(
      updateOrganizationMemberRole(
        adminBCtx,
        { targetMembershipId: managerCtx.membershipId, newRole: 'viewer' },
        handle.db,
      ),
    ).rejects.toThrow(NotFoundError);

    await expect(
      assignMemberToDepartment(
        adminBCtx,
        {
          departmentId: deptSocietario.id,
          membershipId: adminBCtx.membershipId,
          departmentRole: 'manager',
        },
        handle.db,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

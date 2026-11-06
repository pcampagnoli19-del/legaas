import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import {
  demands,
  serviceCategories,
  serviceTypes,
  workflows,
  workflowStages,
} from '@/server/db/schema';
import { withTenant } from '@/server/db/tenant';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/server/errors/app-error';
import {
  createClient,
  createClientContact,
  listOrganizationClients,
  removeClientContact,
  setClientStatus,
  updateClient,
} from '@/server/modules/clients/service';
import {
  createCompany,
  listOrganizationCompanies,
  setCompanyStatus,
  updateCompany,
} from '@/server/modules/companies/service';
import { assignMemberToDepartment, createDepartment } from '@/server/modules/departments/service';
import { inviteOrganizationMember } from '@/server/modules/members/service';
import { acceptInvitation, provisionOrganization } from '@/server/modules/organizations/service';
import { createTestDatabase, type TestDatabaseHandle } from '../setup/test-db';

describe('Fase 1.4 e 1.5 — Clientes, Contatos, Empresas, Grupos Societários, FK Tripla e Isolamento Multi-Tenant', () => {
  let handle: TestDatabaseHandle;

  beforeAll(async () => {
    handle = await createTestDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('gerencia clientes PF/PJ, contatos, empresas, holdings (parent_company_id), unicidade por tenant, FK tripla e isolamento RLS', async () => {
    // 1. Provisiona Organização A e aceita convite do org_admin
    const orgA = await provisionOrganization(
      {
        name: 'Vanguard Societário',
        slug: 'vanguard-societario',
        adminEmail: 'admin@vanguard.leg.br',
      },
      handle.db,
    );

    const adminAAccepted = await acceptInvitation(
      {
        rawToken: orgA.rawInviteToken,
        name: 'Admin Vanguard',
        password: 'AdminPassword!123',
      },
      handle.db,
    );

    const adminACtx = await resolveOfficeTenantContext(
      {
        userId: adminAAccepted.userId,
        orgSlug: 'vanguard-societario',
      },
      handle.db,
    );

    // 2. Cria um cliente Pessoa Jurídica (Grupo Empresarial) com contato principal e um cliente Pessoa Física
    const clientGrupo = await createClient(
      adminACtx,
      {
        type: 'organization',
        name: 'Grupo Horizonte Participações',
        taxId: '12.345.678/0001-90',
        email: 'juridico@horizonte.com.br',
        phone: '(11) 3000-1000',
        ownerMembershipId: adminACtx.membershipId,
        notes: 'Cliente estratégico societário',
        primaryContact: {
          name: 'Dra. Fernanda Lima',
          email: 'fernanda@horizonte.com.br',
          phone: '(11) 98888-1111',
          position: 'Diretora Jurídica',
        },
      },
      handle.db,
    );

    expect(clientGrupo.taxId).toBe('12345678000190');

    const clientPf = await createClient(
      adminACtx,
      {
        type: 'individual',
        name: 'Carlos Eduardo Mendes',
        taxId: '123.456.789-01',
        email: 'carlos.mendes@email.com',
      },
      handle.db,
    );
    expect(clientPf.taxId).toBe('12345678901');

    // Documento inválido para o tipo deve falhar com ValidationError
    await expect(
      createClient(
        adminACtx,
        {
          type: 'individual',
          name: 'CPF Inválido',
          taxId: '12345',
        },
        handle.db,
      ),
    ).rejects.toThrow(ValidationError);

    // Documento duplicado na MESMA organização deve falhar com ConflictError
    await expect(
      createClient(
        adminACtx,
        {
          type: 'organization',
          name: 'Outro Grupo Mesmo CNPJ',
          taxId: '12345678000190',
        },
        handle.db,
      ),
    ).rejects.toThrow(ConflictError);

    // 3. Adiciona segundo contato marcando-o como principal e depois remove o contato secundário
    const secondContact = await createClientContact(
      adminACtx,
      {
        clientId: clientGrupo.id,
        name: 'Ricardo Alves',
        email: 'ricardo@horizonte.com.br',
        position: 'CFO',
        isPrimary: true,
      },
      handle.db,
    );
    expect(secondContact.isPrimary).toBe(true);

    const clientsBeforeRemove = await listOrganizationClients(
      adminACtx,
      { search: 'Horizonte' },
      handle.db,
    );
    expect(clientsBeforeRemove).toHaveLength(1);
    expect(clientsBeforeRemove[0]?.contacts).toHaveLength(2);
    const previousPrimary = clientsBeforeRemove[0]?.contacts.find(
      (c) => c.name === 'Dra. Fernanda Lima',
    );
    expect(previousPrimary?.isPrimary).toBe(false);

    await removeClientContact(adminACtx, { contactId: secondContact.id }, handle.db);

    // Atualiza e altera status do cliente PF
    const updatedPf = await updateClient(
      adminACtx,
      {
        clientId: clientPf.id,
        type: 'individual',
        name: 'Carlos Eduardo Mendes Filho',
        taxId: '123.456.789-01',
        email: 'carlos.filho@email.com',
      },
      handle.db,
    );
    expect(updatedPf.name).toBe('Carlos Eduardo Mendes Filho');

    await setClientStatus(adminACtx, { clientId: clientPf.id, status: 'inactive' }, handle.db);
    const activeClientsOnly = await listOrganizationClients(
      adminACtx,
      { status: 'active' },
      handle.db,
    );
    expect(activeClientsOnly).toHaveLength(1);

    // 4. Gestão de Empresas (Fase 1.5) e Grupos Empresariais (Holding + Controlada via parent_company_id)
    const holdingCompany = await createCompany(
      adminACtx,
      {
        clientId: clientGrupo.id,
        cnpj: '12.345.678/0001-90',
        legalName: 'Horizonte Holding Participações S.A.',
        tradeName: 'Horizonte Holding',
        stateRegistration: 'Isento',
        municipalRegistration: '998877-1',
        addressStreet: 'Av. Brigadeiro Faria Lima',
        addressNumber: '3500',
        addressComplement: '10º Andar',
        addressDistrict: 'Itaim Bibi',
        addressCity: 'São Paulo',
        addressState: 'sp',
        addressZipCode: '04538-132',
      },
      handle.db,
    );

    expect(holdingCompany.cnpj).toBe('12345678000190');

    const subsidiaryCompany = await createCompany(
      adminACtx,
      {
        clientId: clientGrupo.id,
        parentCompanyId: holdingCompany.id,
        cnpj: '12.345.678/0002-71',
        legalName: 'Horizonte Logística Integrada Ltda.',
        tradeName: 'Horizonte Log',
        stateRegistration: '110.220.330.114',
        addressCity: 'Campinas',
        addressState: 'SP',
      },
      handle.db,
    );

    // CNPJ duplicado na mesma organização deve ser rejeitado com ConflictError (409)
    await expect(
      createCompany(
        adminACtx,
        {
          clientId: clientGrupo.id,
          cnpj: '12.345.678/0001-90',
          legalName: 'Duplicada S.A.',
        },
        handle.db,
      ),
    ).rejects.toThrow(ConflictError);

    // Impede auto-referência como holding e referência circular direta entre holding e controlada
    await expect(
      updateCompany(
        adminACtx,
        {
          companyId: holdingCompany.id,
          clientId: clientGrupo.id,
          parentCompanyId: holdingCompany.id,
          cnpj: holdingCompany.cnpj,
          legalName: holdingCompany.legalName,
        },
        handle.db,
      ),
    ).rejects.toThrow(ValidationError);

    await expect(
      updateCompany(
        adminACtx,
        {
          companyId: holdingCompany.id,
          clientId: clientGrupo.id,
          parentCompanyId: subsidiaryCompany.id,
          cnpj: holdingCompany.cnpj,
          legalName: holdingCompany.legalName,
        },
        handle.db,
      ),
    ).rejects.toThrow(ValidationError);

    // Lista empresas e verifica relacionamento com cliente e holding
    const companiesList = await listOrganizationCompanies(
      adminACtx,
      { clientId: clientGrupo.id },
      handle.db,
    );
    expect(companiesList).toHaveLength(2);
    const subDto = companiesList.find((c) => c.id === subsidiaryCompany.id);
    expect(subDto?.parentCompanyId).toBe(holdingCompany.id);
    expect(subDto?.parentCompanyName).toBe('Horizonte Holding Participações S.A.');

    // 5. Integridade estrita da FK Tripla (organization_id, client_id, company_id) em demands (Decisão A2)
    const dept = await createDepartment(adminACtx, { name: 'Societário' }, handle.db);

    const setupMeta = await withTenant(
      { organizationId: adminACtx.organizationId, actorMembershipId: adminACtx.membershipId },
      async (tx) => {
        const [wf] = await tx.select().from(workflows).limit(1);
        const [stage] = await tx.select().from(workflowStages).limit(1);
        const [cat] = await tx
          .insert(serviceCategories)
          .values({
            organizationId: adminACtx.organizationId,
            name: 'Societário',
          })
          .returning();
        const [svc] = await tx
          .insert(serviceTypes)
          .values({
            organizationId: adminACtx.organizationId,
            categoryId: cat!.id,
            defaultDepartmentId: dept.id,
            defaultWorkflowId: wf!.id,
            name: 'Alteração Contratual',
          })
          .returning();
        return { wfId: wf!.id, stageId: stage!.id, serviceTypeId: svc!.id };
      },
      handle.db,
    );

    // Tentar criar uma demanda associando `clientPf.id` com `holdingCompany.id` (que pertence a `clientGrupo.id`)
    // deve ser bloqueado no PostgreSQL pela constraint `demands_company_client_org_fk`!
    await expect(
      withTenant(
        { organizationId: adminACtx.organizationId, actorMembershipId: adminACtx.membershipId },
        async (tx) => {
          await tx.insert(demands).values({
            organizationId: adminACtx.organizationId,
            number: 1,
            code: 'DEM-INVALID-FK',
            title: 'Demanda com Empresa de Outro Cliente',
            clientId: clientPf.id,
            companyId: holdingCompany.id,
            serviceTypeId: setupMeta.serviceTypeId,
            workflowId: setupMeta.wfId,
            stageId: setupMeta.stageId,
            departmentId: dept.id,
            createdByMembershipId: adminACtx.membershipId,
          });
        },
        handle.db,
      ),
    ).rejects.toThrow();

    // 6. Valida RBAC: perfil `viewer` pode ler clientes/empresas, mas não pode criar ou editar
    const viewerInvite = await inviteOrganizationMember(
      adminACtx,
      { email: 'viewer@vanguard.leg.br', role: 'viewer' },
      handle.db,
    );
    const viewerAccepted = await acceptInvitation(
      {
        rawToken: viewerInvite.rawInviteToken,
        name: 'Lucas Viewer',
        password: 'ViewerPassword!123',
      },
      handle.db,
    );
    await assignMemberToDepartment(
      adminACtx,
      {
        departmentId: dept.id,
        membershipId: viewerAccepted.membershipId,
        departmentRole: 'member',
      },
      handle.db,
    );
    const viewerCtx = await resolveOfficeTenantContext(
      {
        userId: viewerAccepted.userId,
        orgSlug: 'vanguard-societario',
      },
      handle.db,
    );

    expect(await listOrganizationClients(viewerCtx, {}, handle.db)).toHaveLength(2);
    expect(await listOrganizationCompanies(viewerCtx, {}, handle.db)).toHaveLength(2);

    await expect(
      createClient(viewerCtx, { type: 'organization', name: 'Bloqueado' }, handle.db),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      setCompanyStatus(
        viewerCtx,
        { companyId: subsidiaryCompany.id, status: 'inactive' },
        handle.db,
      ),
    ).rejects.toThrow(ForbiddenError);

    // 7. Isolamento Multi-Tenant e Unicidade de Documentos por Tenant (Organização B)
    const orgB = await provisionOrganization(
      {
        name: 'Meridian Consultoria',
        slug: 'meridian-consultoria',
        adminEmail: 'admin@meridian.leg.br',
      },
      handle.db,
    );
    const adminBAccepted = await acceptInvitation(
      {
        rawToken: orgB.rawInviteToken,
        name: 'Admin Meridian',
        password: 'MeridianPassword!123',
      },
      handle.db,
    );
    const adminBCtx = await resolveOfficeTenantContext(
      {
        userId: adminBAccepted.userId,
        orgSlug: 'meridian-consultoria',
      },
      handle.db,
    );

    // Organização B não vê nenhum cliente ou empresa da Organização A
    expect(await listOrganizationClients(adminBCtx, {}, handle.db)).toHaveLength(0);
    expect(await listOrganizationCompanies(adminBCtx, {}, handle.db)).toHaveLength(0);

    // Organização B PODE cadastrar o MESMO CNPJ que já existe na Organização A (unicidade por tenant)
    const clientOrgB = await createClient(
      adminBCtx,
      {
        type: 'organization',
        name: 'Grupo Horizonte (Atendido pela Meridian)',
        taxId: '12.345.678/0001-90',
      },
      handle.db,
    );
    const companyOrgB = await createCompany(
      adminBCtx,
      {
        clientId: clientOrgB.id,
        cnpj: '12.345.678/0001-90',
        legalName: 'Horizonte Holding Participações S.A.',
      },
      handle.db,
    );
    expect(companyOrgB.cnpj).toBe('12345678000190');

    // Organização B tentando vincular uma empresa a um cliente da Organização A recebe NotFoundError (404)
    await expect(
      createCompany(
        adminBCtx,
        {
          clientId: clientGrupo.id,
          cnpj: '98.765.432/0001-10',
          legalName: 'Tentativa Cross-Tenant Ltda.',
        },
        handle.db,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

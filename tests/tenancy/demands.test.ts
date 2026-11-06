import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/errors/app-error';
import { createClient } from '@/server/modules/clients/service';
import { createCompany } from '@/server/modules/companies/service';
import {
  addDemandComment,
  addDemandParticipant,
  createDemand,
  getDemandDetails,
  listDemandCatalogMetadata,
  listOrganizationDemands,
  removeDemandParticipant,
  transitionDemandStage,
  updateDemand,
} from '@/server/modules/demands/service';
import {
  assignMemberToDepartment,
  createDepartment,
  listOrganizationDepartments,
} from '@/server/modules/departments/service';
import { inviteOrganizationMember } from '@/server/modules/members/service';
import { acceptInvitation, provisionOrganization } from '@/server/modules/organizations/service';
import { createTestDatabase, type TestDatabaseHandle } from '../setup/test-db';

describe('Fase 1.6 — Gestão de Demandas, Workflow, FK Tripla, Escopo RBAC por Departamento e Auditoria Imutável', () => {
  let handle: TestDatabaseHandle;

  beforeAll(async () => {
    handle = await createTestDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('executa o ciclo de vida completo da demanda, valida a FK tripla Cliente–Empresa, aplica escopo RBAC por departamento e audita cada transição no activity_log', async () => {
    // 1. Provisiona Organização A e aceita convite do org_admin
    const orgA = await provisionOrganization(
      {
        name: 'Vanguard Operações Paralegais',
        slug: 'vanguard-demandas',
        adminEmail: 'admin@vanguard-demandas.leg.br',
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
        orgSlug: 'vanguard-demandas',
      },
      handle.db,
    );

    // 2. Prepara Departamentos: Societário (padrão) e Tributário
    const existingDepts = await listOrganizationDepartments(adminACtx, handle.db);
    const deptSocietarioId = existingDepts[0]!.id;

    const deptTributario = await createDepartment(
      adminACtx,
      {
        name: 'Tributário e Fiscal',
        description: 'Regimes especiais, parcelamentos e inscrições fiscais',
      },
      handle.db,
    );

    // 3. Convida e ativa 3 membros na Organização A:
    // - Analista Societário (alocado apenas em Societário)
    // - Coordenador Societário (alocado em Societário)
    // - Visualizador Societário (viewer alocado em Societário)
    const invAnalyst = await inviteOrganizationMember(
      adminACtx,
      { email: 'analista.soc@vanguard-demandas.leg.br', role: 'analyst' },
      handle.db,
    );
    const analystAccepted = await acceptInvitation(
      {
        rawToken: invAnalyst.rawInviteToken,
        name: 'Analista Societário',
        password: 'UserPassword!123',
      },
      handle.db,
    );
    await assignMemberToDepartment(
      adminACtx,
      {
        departmentId: deptSocietarioId,
        membershipId: analystAccepted.membershipId,
        departmentRole: 'member',
      },
      handle.db,
    );
    const analystCtx = await resolveOfficeTenantContext(
      { userId: analystAccepted.userId, orgSlug: 'vanguard-demandas' },
      handle.db,
    );

    const invCoord = await inviteOrganizationMember(
      adminACtx,
      { email: 'coord.soc@vanguard-demandas.leg.br', role: 'coordinator' },
      handle.db,
    );
    const coordAccepted = await acceptInvitation(
      {
        rawToken: invCoord.rawInviteToken,
        name: 'Coordenadora Societária',
        password: 'UserPassword!123',
      },
      handle.db,
    );
    await assignMemberToDepartment(
      adminACtx,
      {
        departmentId: deptSocietarioId,
        membershipId: coordAccepted.membershipId,
        departmentRole: 'coordinator',
      },
      handle.db,
    );
    const coordCtx = await resolveOfficeTenantContext(
      { userId: coordAccepted.userId, orgSlug: 'vanguard-demandas' },
      handle.db,
    );

    const invViewer = await inviteOrganizationMember(
      adminACtx,
      { email: 'viewer.soc@vanguard-demandas.leg.br', role: 'viewer' },
      handle.db,
    );
    const viewerAccepted = await acceptInvitation(
      {
        rawToken: invViewer.rawInviteToken,
        name: 'Visualizador Societário',
        password: 'UserPassword!123',
      },
      handle.db,
    );
    await assignMemberToDepartment(
      adminACtx,
      {
        departmentId: deptSocietarioId,
        membershipId: viewerAccepted.membershipId,
        departmentRole: 'member',
      },
      handle.db,
    );
    const viewerCtx = await resolveOfficeTenantContext(
      { userId: viewerAccepted.userId, orgSlug: 'vanguard-demandas' },
      handle.db,
    );

    // 4. Cadastra 2 Clientes e suas respectivas Empresas na Organização A
    const clientAlpha = await createClient(
      adminACtx,
      {
        type: 'organization',
        name: 'Grupo Alpha Energia',
        taxId: '11.222.333/0001-44',
      },
      handle.db,
    );

    const companyAlpha = await createCompany(
      adminACtx,
      {
        clientId: clientAlpha.id,
        cnpj: '11.222.333/0001-44',
        legalName: 'Alpha Energia Solar S.A.',
      },
      handle.db,
    );

    const clientBeta = await createClient(
      adminACtx,
      {
        type: 'organization',
        name: 'Beta Logística S.A.',
        taxId: '55.666.777/0001-88',
      },
      handle.db,
    );

    const companyBeta = await createCompany(
      adminACtx,
      {
        clientId: clientBeta.id,
        cnpj: '55.666.777/0001-88',
        legalName: 'Beta Transportes Integrados Ltda.',
      },
      handle.db,
    );

    // 5. Validação estrita da FK Tripla (organization_id, client_id, company_id):
    // Tentar criar demanda para o clientAlpha vinculando a companyBeta deve falhar com ValidationError
    await expect(
      createDemand(
        adminACtx,
        {
          title: 'Demanda com Empresa de Outro Cliente',
          clientId: clientAlpha.id,
          companyId: companyBeta.id,
          departmentId: deptSocietarioId,
        },
        handle.db,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    // 6. Abertura de Demanda válida no Departamento Societário (DEM-0001)
    const demand1 = await createDemand(
      analystCtx,
      {
        title: 'Constituição de SPE Alpha Solar II',
        description: 'Elaboração de ato constitutivo e registro na Junta Comercial.',
        clientId: clientAlpha.id,
        companyId: companyAlpha.id,
        departmentId: deptSocietarioId,
        assigneeMembershipId: analystCtx.membershipId,
        priority: 'high',
        dueDate: '2026-12-20',
      },
      handle.db,
    );

    expect(demand1.number).toBe(1);
    expect(demand1.code).toBe('DEM-0001');
    expect(demand1.statusCategory).toBe('backlog');

    // 7. Abertura de Demanda no Departamento Tributário pelo Admin (DEM-0002)
    const demand2Tributario = await createDemand(
      adminACtx,
      {
        title: 'Revisão de Regime Especial ICMS Beta',
        description: 'Protocolo junto à SEFAZ estadual.',
        clientId: clientBeta.id,
        companyId: companyBeta.id,
        departmentId: deptTributario.id,
        assigneeMembershipId: adminACtx.membershipId,
        priority: 'urgent',
        dueDate: '2026-11-25',
      },
      handle.db,
    );

    expect(demand2Tributario.number).toBe(2);
    expect(demand2Tributario.code).toBe('DEM-0002');

    // 8. Escopo RBAC por Departamento:
    // - Admin vê as 2 demandas (Societário + Tributário)
    const allAdminDemands = await listOrganizationDemands(adminACtx, {}, handle.db);
    expect(allAdminDemands).toHaveLength(2);

    // - Analista Societário vê apenas DEM-0001 (Societário), NÃO vê DEM-0002 (Tributário)
    const analystDemands = await listOrganizationDemands(analystCtx, {}, handle.db);
    expect(analystDemands).toHaveLength(1);
    expect(analystDemands[0]?.code).toBe('DEM-0001');

    // - Analista Societário tentando abrir detalhes ou transicionar DEM-0002 (Tributário) recebe ForbiddenError (403)
    await expect(
      getDemandDetails(analystCtx, demand2Tributario.id, handle.db),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const catalog = await listDemandCatalogMetadata(adminACtx, handle.db);
    const activeStage = catalog.stages.find((s) => s.category === 'active')!;
    const waitingStage = catalog.stages.find((s) => s.category === 'waiting')!;
    const doneStage = catalog.stages.find((s) => s.category === 'done')!;

    await expect(
      transitionDemandStage(
        analystCtx,
        {
          demandId: demand2Tributario.id,
          toStageId: activeStage.id,
        },
        handle.db,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // - Viewer Societário pode ler DEM-0001, mas NÃO pode criar demanda, transicionar etapa nem comentar
    const viewerDetails = await getDemandDetails(viewerCtx, demand1.id, handle.db);
    expect(viewerDetails.code).toBe('DEM-0001');

    await expect(
      createDemand(
        viewerCtx,
        {
          title: 'Tentativa por Viewer',
          clientId: clientAlpha.id,
          departmentId: deptSocietarioId,
        },
        handle.db,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      transitionDemandStage(
        viewerCtx,
        {
          demandId: demand1.id,
          toStageId: activeStage.id,
        },
        handle.db,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // 9. Transições de Etapa do Workflow e Auditoria Automática em activity_log:
    // Analista responsável transiciona DEM-0001: Triagem (backlog) -> Em Elaboração (active) -> Aguardando Órgão (waiting) -> Concluída (done)
    const tr1 = await transitionDemandStage(
      analystCtx,
      {
        demandId: demand1.id,
        toStageId: activeStage.id,
        note: 'Iniciada redação do contrato social da SPE.',
      },
      handle.db,
    );
    expect(tr1.statusCategory).toBe('active');

    const tr2 = await transitionDemandStage(
      analystCtx,
      {
        demandId: demand1.id,
        toStageId: waitingStage.id,
        note: 'Protocolado na Junta Comercial; aguardando deferimento.',
      },
      handle.db,
    );
    expect(tr2.statusCategory).toBe('waiting');

    const tr3 = await transitionDemandStage(
      analystCtx,
      {
        demandId: demand1.id,
        toStageId: doneStage.id,
        note: 'NIRE e CNPJ emitidos e conferidos.',
      },
      handle.db,
    );
    expect(tr3.statusCategory).toBe('done');

    // 10. Regras de Atualização e Reatribuição (demand.update vs demand.assign):
    // - Analista pode atualizar título, prazo e descrição da sua demanda, mas NÃO pode reatribuir para outro analista/departamento
    await expect(
      updateDemand(
        analystCtx,
        {
          demandId: demand1.id,
          title: 'Constituição de SPE Alpha Solar II (Revisada)',
          clientId: clientAlpha.id,
          companyId: companyAlpha.id,
          departmentId: deptSocietarioId,
          assigneeMembershipId: coordCtx.membershipId, // tentativa de reatribuir sem demand.assign
          priority: 'high',
          dueDate: '2026-12-22',
        },
        handle.db,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // - Coordenadora Societária possui demand.assign no seu departamento e consegue reatribuir,
    //   porém se tentar vincular companyBeta ao clientAlpha na edição, falha na FK tripla!
    await expect(
      updateDemand(
        coordCtx,
        {
          demandId: demand1.id,
          title: 'Constituição de SPE Alpha Solar II',
          clientId: clientAlpha.id,
          companyId: companyBeta.id, // violação de FK tripla na edição
          departmentId: deptSocietarioId,
          assigneeMembershipId: coordCtx.membershipId,
          priority: 'urgent',
          dueDate: '2026-12-22',
        },
        handle.db,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const updatedByCoord = await updateDemand(
      coordCtx,
      {
        demandId: demand1.id,
        title: 'Constituição de SPE Alpha Solar II — Finalizada',
        description: 'Ato arquivado com sucesso.',
        clientId: clientAlpha.id,
        companyId: companyAlpha.id,
        departmentId: deptSocietarioId,
        assigneeMembershipId: coordCtx.membershipId,
        priority: 'urgent',
        dueDate: '2026-12-22',
      },
      handle.db,
    );
    expect(updatedByCoord.title).toBe('Constituição de SPE Alpha Solar II — Finalizada');

    // 11. Participantes e Comentários Internos:
    // Admin adiciona o Analista Societário como participante na DEM-0002 (Tributário);
    // a partir desse momento o Analista passa a enxergar DEM-0002!
    await addDemandParticipant(
      adminACtx,
      {
        demandId: demand2Tributario.id,
        membershipId: analystCtx.membershipId,
        role: 'collaborator',
      },
      handle.db,
    );

    const analystDemandsAfterParticipant = await listOrganizationDemands(analystCtx, {}, handle.db);
    expect(analystDemandsAfterParticipant).toHaveLength(2);

    // Como participante de DEM-0002, o Analista pode registrar comentário em DEM-0002
    await addDemandComment(
      analystCtx,
      {
        demandId: demand2Tributario.id,
        body: 'Parecer societário complementar anexado em apoio ao departamento tributário.',
      },
      handle.db,
    );

    // Em DEM-0001 (agora atribuída à Coordenadora), a Coordenadora registra o comentário final
    await addDemandComment(
      coordCtx,
      {
        demandId: demand1.id,
        body: 'Arquivamento definitivo conferido e disponibilizado na pasta societária.',
      },
      handle.db,
    );

    await removeDemandParticipant(
      adminACtx,
      {
        demandId: demand2Tributario.id,
        membershipId: analystCtx.membershipId,
      },
      handle.db,
    );

    // 12. Verifica detalhes completos, histórico de etapas e trilha imutável no activity_log
    const fullDetails = await getDemandDetails(adminACtx, demand1.id, handle.db);
    expect(fullDetails.code).toBe('DEM-0001');
    expect(fullDetails.statusCategory).toBe('done');
    expect(fullDetails.completedAt).not.toBeNull();
    // 1 entrada inicial + 3 transições = 4 registros em demand_stage_history
    expect(fullDetails.stageHistory).toHaveLength(4);
    expect(fullDetails.comments).toHaveLength(1);

    // Verifica que activity_log contém demand.created, 3x demand.stage_transitioned, demand.updated e demand.comment_added
    const auditActions = fullDetails.activityTimeline.map((a) => a.action);
    expect(auditActions).toContain('demand.created');
    expect(auditActions.filter((a) => a === 'demand.stage_transitioned')).toHaveLength(3);
    expect(auditActions).toContain('demand.updated');
    expect(auditActions).toContain('demand.comment_added');

    // 13. Filtros combinados em listOrganizationDemands
    const filteredByClient = await listOrganizationDemands(
      adminACtx,
      { clientId: clientAlpha.id, statusCategory: 'done' },
      handle.db,
    );
    expect(filteredByClient).toHaveLength(1);
    expect(filteredByClient[0]?.code).toBe('DEM-0001');

    // 14. Isolamento Multi-Tenant estrito via PostgreSQL RLS:
    // Organização B não vê demandas da Organização A e inicia sua própria sequência em DEM-0001
    const orgB = await provisionOrganization(
      {
        name: 'meridian-demandas',
        slug: 'meridian-demandas',
        adminEmail: 'admin@meridian-demandas.leg.br',
      },
      handle.db,
    );

    const adminBAccepted = await acceptInvitation(
      {
        rawToken: orgB.rawInviteToken,
        name: 'Admin Meridian',
        password: 'AdminPassword!123',
      },
      handle.db,
    );

    const adminBCtx = await resolveOfficeTenantContext(
      { userId: adminBAccepted.userId, orgSlug: 'meridian-demandas' },
      handle.db,
    );

    const orgBDemands = await listOrganizationDemands(adminBCtx, {}, handle.db);
    expect(orgBDemands).toHaveLength(0);

    await expect(getDemandDetails(adminBCtx, demand1.id, handle.db)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await expect(
      transitionDemandStage(
        adminBCtx,
        {
          demandId: demand1.id,
          toStageId: activeStage.id,
        },
        handle.db,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

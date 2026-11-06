import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { ConflictError, ForbiddenError, ValidationError } from '@/server/errors/app-error';
import { createClient } from '@/server/modules/clients/service';
import {
  createDemand,
  getDemandDetails,
  listDemandCatalogMetadata,
  transitionDemandStage,
} from '@/server/modules/demands/service';
import { listOrganizationDepartments } from '@/server/modules/departments/service';
import { inviteOrganizationMember } from '@/server/modules/members/service';
import { acceptInvitation, provisionOrganization } from '@/server/modules/organizations/service';
import {
  archiveWorkflowStage,
  createServiceType,
  createWorkflow,
  createWorkflowStage,
  listOrganizationWorkflowsCatalog,
  reorderWorkflowStages,
  setWorkflowTransitionRules,
  updateServiceTypeWorkflow,
  updateWorkflowStage,
} from '@/server/modules/workflows/service';
import { createTestDatabase, type TestDatabaseHandle } from '../setup/test-db';

describe('Fase 1.7 — Workflows, Etapas, Ordenação, Regras de Transição, Integridade Referencial e Isolamento Multi-Tenant', () => {
  let handle: TestDatabaseHandle;

  beforeAll(async () => {
    handle = await createTestDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('gerencia esteiras personalizadas, reordena etapas, aplica bloqueios configuráveis de transição, preserva integridade referencial com demandas e isola tenants via RLS', async () => {
    // 1. Provisiona Organização A e aceita convite do org_admin
    const orgA = await provisionOrganization(
      {
        name: 'Atlas Gestão Societária e Regulatória',
        slug: 'atlas-workflows',
        adminEmail: 'admin@atlas-workflows.leg.br',
      },
      handle.db,
    );

    const adminAAccepted = await acceptInvitation(
      {
        rawToken: orgA.rawInviteToken,
        name: 'Admin Atlas',
        password: 'AdminPassword!123',
      },
      handle.db,
    );

    const adminACtx = await resolveOfficeTenantContext(
      {
        userId: adminAAccepted.userId,
        orgSlug: 'atlas-workflows',
      },
      handle.db,
    );

    // 2. Convida Analista e verifica bloqueio RBAC para mutações em workflows (exclusivas de org_admin)
    const invAnalyst = await inviteOrganizationMember(
      adminACtx,
      { email: 'analista@atlas-workflows.leg.br', role: 'analyst' },
      handle.db,
    );
    const analystAccepted = await acceptInvitation(
      {
        rawToken: invAnalyst.rawInviteToken,
        name: 'Analista Atlas',
        password: 'UserPassword!123',
      },
      handle.db,
    );
    const analystCtx = await resolveOfficeTenantContext(
      {
        userId: analystAccepted.userId,
        orgSlug: 'atlas-workflows',
      },
      handle.db,
    );

    await expect(
      createWorkflow(
        analystCtx,
        {
          name: 'Esteira Não Autorizada',
        },
        handle.db,
      ),
    ).rejects.toThrow(ForbiddenError);

    // 3. Cria esteira personalizada com etapas iniciais e vincula a um novo Tipo de Serviço
    const depts = await listOrganizationDepartments(adminACtx, handle.db);
    const defaultDeptId = depts[0]!.id;

    const customWf = await createWorkflow(
      adminACtx,
      {
        name: 'Esteira de Licenciamento Ambiental e Sanitário',
        isDefault: false,
        stages: [
          { name: 'Triagem Documental', category: 'backlog' },
          { name: 'Elaboração de Laudo Técnico', category: 'active' },
          { name: 'Análise do Órgão Ambiental', category: 'waiting' },
          { name: 'Licença Emitida', category: 'done' },
        ],
      },
      handle.db,
    );

    expect(customWf.stagesCount).toBe(4);

    // Adiciona uma nova etapa inicial (asInitialStage = true) na Posição 1
    const preTriageStage = await createWorkflowStage(
      adminACtx,
      {
        workflowId: customWf.id,
        name: 'Recebimento de Solicitação Preliminar',
        category: 'backlog',
        asInitialStage: true,
      },
      handle.db,
    );
    expect(preTriageStage.position).toBe(1);

    let catalog = await listOrganizationWorkflowsCatalog(adminACtx, handle.db);
    let wfSummary = catalog.workflows.find((w) => w.id === customWf.id)!;
    expect(wfSummary.stages).toHaveLength(5);
    expect(wfSummary.stages.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);
    expect(wfSummary.stages[0]!.id).toBe(preTriageStage.id);

    // 4. Reordena etapas: move a etapa 2 ('Triagem Documental') de volta para a Posição 1 (etapa inicial)
    const stageTriagem = wfSummary.stages[1]!;
    const stageLaudo = wfSummary.stages[2]!;
    const stageOrgao = wfSummary.stages[3]!;
    const stageEmitida = wfSummary.stages[4]!;

    await reorderWorkflowStages(
      adminACtx,
      {
        workflowId: customWf.id,
        orderedStageIds: [
          stageTriagem.id,
          preTriageStage.id,
          stageLaudo.id,
          stageOrgao.id,
          stageEmitida.id,
        ],
      },
      handle.db,
    );

    catalog = await listOrganizationWorkflowsCatalog(adminACtx, handle.db);
    wfSummary = catalog.workflows.find((w) => w.id === customWf.id)!;
    expect(wfSummary.stages[0]!.id).toBe(stageTriagem.id);
    expect(wfSummary.stages[0]!.position).toBe(1);
    expect(wfSummary.stages[1]!.id).toBe(preTriageStage.id);
    expect(wfSummary.stages[1]!.position).toBe(2);

    // 5. Cria Tipo de Serviço vinculado à nova esteira e verifica presença no catálogo de abertura de demandas
    const customSvc = await createServiceType(
      adminACtx,
      {
        newCategoryName: 'Regulatório e Licenciamento',
        name: 'Licença de Operação CETESB',
        defaultDepartmentId: defaultDeptId,
        defaultWorkflowId: customWf.id,
      },
      handle.db,
    );
    expect(customSvc.defaultWorkflowId).toBe(customWf.id);

    const demandCatalog = await listDemandCatalogMetadata(adminACtx, handle.db);
    expect(demandCatalog.workflows.some((w) => w.id === customWf.id)).toBe(true);

    // 6. Cria Cliente e Demanda vinculada à esteira personalizada -> deve iniciar na Posição 1 ('stageTriagem')
    const clientA = await createClient(
      adminACtx,
      {
        type: 'organization',
        name: 'BioVerde Indústria Química S.A.',
        taxId: '44556677000188',
      },
      handle.db,
    );

    const demand = await createDemand(
      adminACtx,
      {
        title: 'Obtenção de Licença de Operação da Planta Industrial',
        clientId: clientA.id,
        serviceTypeId: customSvc.id,
        workflowId: customWf.id,
        departmentId: defaultDeptId,
        priority: 'high',
      },
      handle.db,
    );

    expect(demand.statusCategory).toBe('backlog');

    const initialDetails = await getDemandDetails(adminACtx, demand.id, handle.db);
    expect(initialDetails.workflowId).toBe(customWf.id);
    expect(initialDetails.stageId).toBe(stageTriagem.id);

    // 7. Configura Regras de Transição de Etapa (workflow_transitions) e valida bloqueios
    // Permite apenas: Triagem -> Laudo Técnico, e Laudo Técnico -> Análise do Órgão
    // Bloqueia pulo direto de Triagem -> Licença Emitida
    await setWorkflowTransitionRules(
      adminACtx,
      {
        workflowId: customWf.id,
        transitions: [
          { fromStageId: stageTriagem.id, toStageId: stageLaudo.id },
          { fromStageId: stageLaudo.id, toStageId: stageOrgao.id },
          { fromStageId: stageOrgao.id, toStageId: stageEmitida.id },
        ],
      },
      handle.db,
    );

    const detailsBefore = await getDemandDetails(adminACtx, demand.id, handle.db);
    expect(detailsBefore.allowedTargetStageIds).toEqual([stageTriagem.id, stageLaudo.id]);

    // Tentativa de transição bloqueada pela matriz (Triagem -> Licença Emitida) deve falhar com ValidationError
    await expect(
      transitionDemandStage(
        adminACtx,
        {
          demandId: demand.id,
          toStageId: stageEmitida.id,
          note: 'Tentativa de pular etapas obrigatórias',
        },
        handle.db,
      ),
    ).rejects.toThrow(ValidationError);

    // Transição permitida (Triagem -> Laudo Técnico) deve funcionar e derivar statusCategory = 'active'
    const transitioned = await transitionDemandStage(
      adminACtx,
      {
        demandId: demand.id,
        toStageId: stageLaudo.id,
        note: 'Documentação conferida; iniciando elaboração do laudo.',
      },
      handle.db,
    );
    expect(transitioned.toStageId).toBe(stageLaudo.id);
    expect(transitioned.statusCategory).toBe('active');

    // 8. Integridade Referencial com Demandas Existentes:
    // 8.a) Alterar a categoria canônica da etapa atual ('stageLaudo') de 'active' para 'waiting'
    //      deve sincronizar automaticamente o statusCategory da demanda posicionada nela (Decisão A6)
    await updateWorkflowStage(
      adminACtx,
      {
        stageId: stageLaudo.id,
        name: 'Elaboração de Laudo Técnico (Aguardando Amostras)',
        category: 'waiting',
      },
      handle.db,
    );

    const detailsAfterCategoryChange = await getDemandDetails(adminACtx, demand.id, handle.db);
    expect(detailsAfterCategoryChange.statusCategory).toBe('waiting');
    expect(detailsAfterCategoryChange.stageName).toBe(
      'Elaboração de Laudo Técnico (Aguardando Amostras)',
    );

    // 8.b) Tentar arquivar a etapa 'stageLaudo' (que possui 1 demanda vinculada) SEM fallbackStageId
    //      deve ser bloqueado com ConflictError
    await expect(
      archiveWorkflowStage(
        adminACtx,
        {
          stageId: stageLaudo.id,
        },
        handle.db,
      ),
    ).rejects.toThrow(ConflictError);

    // 8.c) Arquivar a etapa 'stageLaudo' informando fallbackStageId = 'stageOrgao.id'
    //      deve migrar a demanda para 'stageOrgao', arquivar 'stageLaudo' e reordenar as posições 1..N
    const archiveResult = await archiveWorkflowStage(
      adminACtx,
      {
        stageId: stageLaudo.id,
        fallbackStageId: stageOrgao.id,
      },
      handle.db,
    );
    expect(archiveResult.migratedDemandsCount).toBe(1);

    const detailsAfterArchive = await getDemandDetails(adminACtx, demand.id, handle.db);
    expect(detailsAfterArchive.stageId).toBe(stageOrgao.id);

    const catalogAfterArchive = await listOrganizationWorkflowsCatalog(adminACtx, handle.db);
    const wfAfterArchive = catalogAfterArchive.workflows.find((w) => w.id === customWf.id)!;
    expect(wfAfterArchive.stages).toHaveLength(4);
    expect(wfAfterArchive.stages.map((s) => s.position)).toEqual([1, 2, 3, 4]);

    // Também testa atualização do workflow padrão de um serviço existente
    const defaultWf = catalogAfterArchive.workflows.find((w) => w.id !== customWf.id)!;
    const updatedSvc = await updateServiceTypeWorkflow(
      adminACtx,
      {
        serviceTypeId: customSvc.id,
        defaultWorkflowId: defaultWf.id,
      },
      handle.db,
    );
    expect(updatedSvc.defaultWorkflowId).toBe(defaultWf.id);

    // 9. Isolamento Multi-Tenant (RLS): Organização B não enxerga nem consegue manipular workflows da Organização A
    const orgB = await provisionOrganization(
      {
        name: 'Horizonte Consultoria Paralegal',
        slug: 'horizonte-workflows',
        adminEmail: 'admin@horizonte-workflows.leg.br',
      },
      handle.db,
    );
    const adminBAccepted = await acceptInvitation(
      {
        rawToken: orgB.rawInviteToken,
        name: 'Admin Horizonte',
        password: 'AdminPassword!123',
      },
      handle.db,
    );
    const adminBCtx = await resolveOfficeTenantContext(
      {
        userId: adminBAccepted.userId,
        orgSlug: 'horizonte-workflows',
      },
      handle.db,
    );

    const orgBCatalog = await listOrganizationWorkflowsCatalog(adminBCtx, handle.db);
    expect(orgBCatalog.workflows.some((w) => w.id === customWf.id)).toBe(false);
    expect(orgBCatalog.serviceTypes.some((s) => s.id === customSvc.id)).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { ForbiddenError, ValidationError } from '@/server/errors/app-error';
import {
  analyzeCertificatePdfWithGroq,
  extractCertificateMetadataDeterministic,
  extractTextFromPdfBuffer,
} from '@/server/modules/certificates/groq-extractor';
import {
  archiveCertificateDocument,
  getOrganizationExpirationAlerts,
  listOrganizationCertificates,
  registerCertificateDocument,
  updateCertificateDocument,
} from '@/server/modules/certificates/service';
import { createClient } from '@/server/modules/clients/service';
import { createCompany } from '@/server/modules/companies/service';
import { createDemand } from '@/server/modules/demands/service';
import { listOrganizationDepartments } from '@/server/modules/departments/service';
import { inviteOrganizationMember } from '@/server/modules/members/service';
import { acceptInvitation, provisionOrganization } from '@/server/modules/organizations/service';
import { createTestDatabase, type TestDatabaseHandle } from '../setup/test-db';

describe('Fase 1.8 — Gestão de Certidões e Validades com IA (Groq), Motor de Alertas de Vencimento e Isolamento Multi-Tenant', () => {
  let handle: TestDatabaseHandle;

  beforeAll(async () => {
    handle = await createTestDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('extrai datas de validade e metadados de PDFs de certidões (Groq LLM JSON mode + Fallback Determinístico)', async () => {
    const samplePdfContent = `%PDF-1.4
1 0 obj
<< /Length 220 >>
stream
BT
(MINISTERIO DA FAZENDA - SECRETARIA DA RECEITA FEDERAL DO BRASIL) Tj
(CERTIDAO NEGATIVA DE DEBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E A DIVIDA ATIVA DA UNIAO) Tj
(CNPJ: 12.345.678/0001-90) Tj
(Emitida em: 10/10/2026) Tj
(Valida ate: 08/04/2027) Tj
(Codigo de controle da certidao: ABCD.1122.3344.5566) Tj
ET
endstream
endobj
%%EOF`;

    const pdfBuffer = Buffer.from(samplePdfContent, 'latin1');
    const extractedText = extractTextFromPdfBuffer(pdfBuffer);
    expect(extractedText).toContain('RECEITA FEDERAL DO BRASIL');
    expect(extractedText).toContain('12.345.678/0001-90');

    // 1. Extração determinística (sem necessidade de GROQ_API_KEY externa)
    const deterministic = extractCertificateMetadataDeterministic(
      extractedText,
      'CND_Federal_Horizonte.pdf',
    );
    expect(deterministic.certificateType).toBe('CND_RFB_PGFN');
    expect(deterministic.cnpj).toBe('12345678000190');
    expect(deterministic.issueDate).toBe('2026-10-10');
    expect(deterministic.expirationDate).toBe('2027-04-08');
    expect(deterministic.controlCode).toBe('ABCD.1122.3344.5566');
    expect(deterministic.extractionEngine).toBe('deterministic-regex');

    // 2. Extração de CRF FGTS com intervalo de validade ("Validade: 01/11/2026 a 30/11/2026")
    const fgtsSample = extractCertificateMetadataDeterministic(
      'CAIXA ECONOMICA FEDERAL - CERTIFICADO DE REGULARIDADE DO FGTS - CRF. Inscrição: 12.345.678/0001-90. Validade: 01/11/2026 a 30/11/2026.',
      'CRF_FGTS.pdf',
    );
    expect(fgtsSample.certificateType).toBe('CRF_FGTS');
    expect(fgtsSample.issueDate).toBe('2026-11-01');
    expect(fgtsSample.expirationDate).toBe('2026-11-30');

    // 3. Integração com a API da Groq (simulando resposta JSON estruturada do modelo llama-3.3-70b-versatile)
    const originalGroqKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_test_groq_key_for_unit_integration_validation';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Certidão Negativa de Débitos Trabalhistas — CNDT (TST)',
                  certificateType: 'CNDT_TST',
                  issuingAuthority: 'Tribunal Superior do Trabalho — TST',
                  cnpj: '12.345.678/0001-90',
                  companyName: 'Horizonte Holding Participações S.A.',
                  issueDate: '2026-11-01',
                  expirationDate: '2027-05-01',
                  controlCode: 'TST-99887766',
                  confidence: 'high',
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    try {
      const groqResult = await analyzeCertificatePdfWithGroq({
        pdfBuffer,
        originalFileName: 'CNDT_Trabalhista.pdf',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(groqResult.extractionEngine).toBe('groq-llm');
      expect(groqResult.certificateType).toBe('CNDT_TST');
      expect(groqResult.cnpj).toBe('12345678000190');
      expect(groqResult.expirationDate).toBe('2027-05-01');
      expect(groqResult.controlCode).toBe('TST-99887766');
    } finally {
      fetchSpy.mockRestore();
      if (originalGroqKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalGroqKey;
      }
    }
  });

  it('registra certidões, valida integridade Cliente–Empresa, cria deadline automática em demandas, aciona o motor de alertas de vencimento e isola tenants via RLS', async () => {
    // 1. Provisiona Organização A e aceita convite do org_admin
    const orgA = await provisionOrganization(
      {
        name: 'Cronos Gestão de Certidões e Compliance',
        slug: 'cronos-certidoes',
        adminEmail: 'admin@cronos-certidoes.leg.br',
      },
      handle.db,
    );

    const adminAAccepted = await acceptInvitation(
      {
        rawToken: orgA.rawInviteToken,
        name: 'Admin Cronos',
        password: 'AdminPassword!123',
      },
      handle.db,
    );

    const adminACtx = await resolveOfficeTenantContext(
      {
        userId: adminAAccepted.userId,
        orgSlug: 'cronos-certidoes',
      },
      handle.db,
    );

    const depts = await listOrganizationDepartments(adminACtx, handle.db);
    const defaultDeptId = depts[0]!.id;

    // 2. Cria Cliente 1 (com Empresa 1) e Cliente 2 (com Empresa 2)
    const client1 = await createClient(
      adminACtx,
      {
        type: 'organization',
        name: 'Grupo Solaris Energia S.A.',
        taxId: '11222333000181',
      },
      handle.db,
    );

    const company1 = await createCompany(
      adminACtx,
      {
        clientId: client1.id,
        cnpj: '11222333000181',
        legalName: 'Solaris Geração Fotovoltaica S.A.',
      },
      handle.db,
    );

    const client2 = await createClient(
      adminACtx,
      {
        type: 'organization',
        name: 'Vértice Engenharia Ltda.',
        taxId: '55666777000199',
      },
      handle.db,
    );

    const company2 = await createCompany(
      adminACtx,
      {
        clientId: client2.id,
        cnpj: '55666777000199',
        legalName: 'Vértice Obras Civis Ltda.',
      },
      handle.db,
    );

    // 3. Rejeita certidão que tenta vincular Empresa 2 ao Cliente 1 (proteção de integridade Cliente–Empresa)
    await expect(
      registerCertificateDocument(
        adminACtx,
        {
          title: 'CND com Vínculo Inconsistente',
          certificateType: 'CND_RFB_PGFN',
          clientId: client1.id,
          companyId: company2.id,
          originalName: 'cnd_invalida.pdf',
        },
        handle.db,
      ),
    ).rejects.toThrow(ValidationError);

    // 4. Abre Demanda para o Cliente 1 / Empresa 1
    const demand1 = await createDemand(
      adminACtx,
      {
        title: 'Renovação de Certidões para Licitação Pública',
        clientId: client1.id,
        companyId: company1.id,
        departmentId: defaultDeptId,
        priority: 'urgent',
      },
      handle.db,
    );

    // Data de referência fixa para determinismo nos cálculos de vencimento: 2026-11-10
    const refDate = new Date('2026-11-10T12:00:00Z');

    // 5. Registra 3 certidões:
    // - Certidão 1: VENCIDA (2026-11-05 -> -5 dias)
    const certExpired = await registerCertificateDocument(
      adminACtx,
      {
        title: 'AVCB Corpo de Bombeiros — Usina Solaris',
        certificateType: 'AVCB_CLCB_BOMBEIROS',
        issuingAuthority: 'Corpo de Bombeiros Militar',
        issueDate: '2025-11-05',
        expirationDate: '2026-11-05',
        alertDaysBefore: [30, 15, 7],
        controlCode: 'AVCB-001',
        clientId: client1.id,
        companyId: company1.id,
        demandId: demand1.id,
        originalName: 'avcb_solaris.pdf',
        createLinkedDeadline: true,
      },
      handle.db,
    );
    expect(certExpired.linkedDeadlineId).toBeTruthy();

    // - Certidão 2: CRÍTICA ATÉ 7 DIAS (2026-11-15 -> +5 dias)
    const certCritical = await registerCertificateDocument(
      adminACtx,
      {
        title: 'Certificado de Regularidade do FGTS — CRF',
        certificateType: 'CRF_FGTS',
        issuingAuthority: 'Caixa Econômica Federal',
        issueDate: '2026-10-16',
        expirationDate: '2026-11-15',
        alertDaysBefore: [30, 15, 7],
        controlCode: 'CRF-002',
        clientId: client1.id,
        companyId: company1.id,
        demandId: demand1.id,
        originalName: 'crf_fgts_solaris.pdf',
        createLinkedDeadline: true,
      },
      handle.db,
    );
    expect(certCritical.linkedDeadlineId).toBeTruthy();

    // - Certidão 3: REGULAR / VIGENTE (2027-04-20 -> +161 dias)
    const certValid = await registerCertificateDocument(
      adminACtx,
      {
        title: 'CND Conjunta RFB e PGFN',
        certificateType: 'CND_RFB_PGFN',
        issuingAuthority: 'Receita Federal do Brasil',
        issueDate: '2026-10-20',
        expirationDate: '2027-04-20',
        alertDaysBefore: [30, 15, 7],
        controlCode: 'RFB-003',
        clientId: client1.id,
        companyId: company1.id,
        originalName: 'cnd_rfb_solaris.pdf',
      },
      handle.db,
    );

    // 6. Avalia o Motor de Alertas de Vencimento na data de referência (2026-11-10)
    const alertsDashboard = await getOrganizationExpirationAlerts(adminACtx, handle.db, refDate);
    expect(alertsDashboard.summary.totalTrackedCertificates).toBe(3);
    expect(alertsDashboard.summary.expiredCount).toBe(1);
    expect(alertsDashboard.summary.critical7DaysCount).toBe(1);
    expect(alertsDashboard.summary.validCount).toBe(1);
    expect(alertsDashboard.alerts.length).toBeGreaterThanOrEqual(2);
    expect(alertsDashboard.alerts[0]!.id).toBe(certExpired.id);
    expect(alertsDashboard.alerts[0]!.severity).toBe('expired');
    expect(alertsDashboard.alerts[0]!.daysRemaining).toBe(-5);

    // 7. Atualiza a Certidão Vencida (renovada até 2027-11-05) e verifica que sai da lista de vencidas
    await updateCertificateDocument(
      adminACtx,
      {
        documentId: certExpired.id,
        title: 'AVCB Corpo de Bombeiros — Usina Solaris (Renovado)',
        certificateType: 'AVCB_CLCB_BOMBEIROS',
        issueDate: '2026-11-10',
        expirationDate: '2027-11-05',
      },
      handle.db,
    );

    const alertsAfterRenewal = await getOrganizationExpirationAlerts(adminACtx, handle.db, refDate);
    expect(alertsAfterRenewal.summary.expiredCount).toBe(0);
    expect(alertsAfterRenewal.summary.validCount).toBe(2);

    // 8. Arquiva a Certidão 3 e verifica que deixa de ser listada
    await archiveCertificateDocument(adminACtx, certValid.id, handle.db);
    const remainingCerts = await listOrganizationCertificates(adminACtx, {}, handle.db, refDate);
    expect(remainingCerts).toHaveLength(2);

    // 9. Verifica RBAC: usuário 'viewer' não pode registrar nem arquivar certidões
    const invViewer = await inviteOrganizationMember(
      adminACtx,
      { email: 'viewer@cronos-certidoes.leg.br', role: 'viewer' },
      handle.db,
    );
    const viewerAccepted = await acceptInvitation(
      {
        rawToken: invViewer.rawInviteToken,
        name: 'Viewer Cronos',
        password: 'UserPassword!123',
      },
      handle.db,
    );
    const viewerCtx = await resolveOfficeTenantContext(
      {
        userId: viewerAccepted.userId,
        orgSlug: 'cronos-certidoes',
      },
      handle.db,
    );

    await expect(
      registerCertificateDocument(
        viewerCtx,
        {
          title: 'Tentativa Viewer',
          certificateType: 'CND_MUNICIPAL',
          clientId: client1.id,
          originalName: 'viewer.pdf',
        },
        handle.db,
      ),
    ).rejects.toThrow(ForbiddenError);

    // 10. Isolamento Multi-Tenant (RLS): Organização B não enxerga certidões nem alertas da Organização A
    const orgB = await provisionOrganization(
      {
        name: 'Vega Consultoria Regulatória',
        slug: 'vega-certidoes',
        adminEmail: 'admin@vega-certidoes.leg.br',
      },
      handle.db,
    );
    const adminBAccepted = await acceptInvitation(
      {
        rawToken: orgB.rawInviteToken,
        name: 'Admin Vega',
        password: 'AdminPassword!123',
      },
      handle.db,
    );
    const adminBCtx = await resolveOfficeTenantContext(
      {
        userId: adminBAccepted.userId,
        orgSlug: 'vega-certidoes',
      },
      handle.db,
    );

    const orgBCerts = await listOrganizationCertificates(adminBCtx, {}, handle.db, refDate);
    expect(orgBCerts).toHaveLength(0);

    const orgBAlerts = await getOrganizationExpirationAlerts(adminBCtx, handle.db, refDate);
    expect(orgBAlerts.summary.totalTrackedCertificates).toBe(0);
    expect(orgBAlerts.alerts).toHaveLength(0);
  });
});

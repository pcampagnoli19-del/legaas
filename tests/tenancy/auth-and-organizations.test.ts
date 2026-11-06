import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authenticateWithEmailPassword,
  requestPasswordReset,
  resetPasswordWithToken,
} from '@/server/auth/service';
import { getValidatedSessionByToken, revokeSessionByToken } from '@/server/auth/session';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { activityLog, workflowStages } from '@/server/db/schema';
import { withTenant } from '@/server/db/tenant';
import { ConflictError, NotFoundError, UnauthorizedError } from '@/server/errors/app-error';
import {
  acceptInvitation,
  inspectInvitationToken,
  provisionOrganization,
} from '@/server/modules/organizations/service';
import { createTestDatabase, type TestDatabaseHandle } from '../setup/test-db';

describe('Fase 1.1 — Autenticação, Organizações, Convites de Uso Único e Contexto Multi-Tenant', () => {
  let handle: TestDatabaseHandle;

  beforeAll(async () => {
    handle = await createTestDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('provisiona organização em regime fechado (Decisão A4), cria workflow padrão e emite convite auditado de uso único', async () => {
    const provisioned = await provisionOrganization(
      {
        name: 'Vértice Societário & Paralegal',
        slug: 'vertice-societario',
        adminEmail: 'mariana@vertice.leg.br',
      },
      handle.db,
    );

    expect(provisioned.slug).toBe('vertice-societario');
    expect(provisioned.rawInviteToken.length).toBeGreaterThanOrEqual(32);

    // Verifica que o workflow padrão (5 etapas) e o activity_log foram gravados na organização
    const stages = await withTenant(
      { organizationId: provisioned.organizationId },
      async (tx) => tx.select().from(workflowStages),
      handle.db,
    );
    expect(stages).toHaveLength(5);

    const logs = await withTenant(
      { organizationId: provisioned.organizationId },
      async (tx) => tx.select().from(activityLog),
      handle.db,
    );
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining(['organization.provisioned', 'invitation.created']),
    );

    // Rejeita slug duplicado
    await expect(
      provisionOrganization(
        {
          name: 'Outra Vértice',
          slug: 'vertice-societario',
          adminEmail: 'outro@vertice.leg.br',
        },
        handle.db,
      ),
    ).rejects.toThrow(ConflictError);

    // Inspeciona o token de convite emitido
    const inspected = await inspectInvitationToken(provisioned.rawInviteToken, handle.db);
    expect(inspected.status).toBe('valid');
    expect(inspected.organizationSlug).toBe('vertice-societario');
    expect(inspected.email).toBe('mariana@vertice.leg.br');
    expect(inspected.role).toBe('org_admin');

    // Aceita o convite de uso único
    const accepted = await acceptInvitation(
      {
        rawToken: provisioned.rawInviteToken,
        name: 'Dra. Mariana Souza',
        password: 'SenhaForte!2026',
      },
      handle.db,
    );

    expect(accepted.organizationSlug).toBe('vertice-societario');
    expect(accepted.email).toBe('mariana@vertice.leg.br');

    // Tentar reutilizar o mesmo token deve falhar (uso único!)
    const reInspected = await inspectInvitationToken(provisioned.rawInviteToken, handle.db);
    expect(reInspected.status).toBe('accepted');

    await expect(
      acceptInvitation(
        {
          rawToken: provisioned.rawInviteToken,
          name: 'Tentativa Reuso',
          password: 'OutraSenha!2026',
        },
        handle.db,
      ),
    ).rejects.toThrow(/já foi utilizado/);
  });

  it('autentica usuário, gerencia ciclo de vida da sessão e revoga sessões na redefinição de senha', async () => {
    // Senha incorreta é rejeitada
    await expect(
      authenticateWithEmailPassword(
        {
          email: 'mariana@vertice.leg.br',
          password: 'SenhaErrada!000',
        },
        handle.db,
      ),
    ).rejects.toThrow(UnauthorizedError);

    // Login válido cria sessão e lista organizações ativas
    const login = await authenticateWithEmailPassword(
      {
        email: 'mariana@vertice.leg.br',
        password: 'SenhaForte!2026',
        ipAddress: '127.0.0.1',
        userAgent: 'Vitest',
      },
      handle.db,
    );

    expect(login.name).toBe('Dra. Mariana Souza');
    expect(login.organizations).toHaveLength(1);
    expect(login.organizations[0]?.orgSlug).toBe('vertice-societario');

    // Valida sessão pelo token bruto
    const validSession = await getValidatedSessionByToken(login.rawSessionToken, handle.db);
    expect(validSession?.userId).toBe(login.userId);

    // Fluxo de recuperação de senha
    const resetReq = await requestPasswordReset({ email: 'mariana@vertice.leg.br' }, handle.db);
    expect(resetReq.issued).toBe(true);
    expect(resetReq.rawResetToken).toBeDefined();

    await resetPasswordWithToken(
      {
        rawToken: resetReq.rawResetToken!,
        newPassword: 'NovaSenhaForte!2027',
      },
      handle.db,
    );

    // A sessão anterior deve ter sido automaticamente revogada após a redefinição de senha
    const revokedSessionAfterReset = await getValidatedSessionByToken(
      login.rawSessionToken,
      handle.db,
    );
    expect(revokedSessionAfterReset).toBeNull();

    // O token de recuperação não pode ser reutilizado
    await expect(
      resetPasswordWithToken(
        {
          rawToken: resetReq.rawResetToken!,
          newPassword: 'TentativaReusoReset!2027',
        },
        handle.db,
      ),
    ).rejects.toThrow(/inválido ou expirado/);

    // Novo login com a nova senha funciona e logout revoga a sessão
    const secondLogin = await authenticateWithEmailPassword(
      {
        email: 'mariana@vertice.leg.br',
        password: 'NovaSenhaForte!2027',
      },
      handle.db,
    );
    expect(await getValidatedSessionByToken(secondLogin.rawSessionToken, handle.db)).not.toBeNull();

    await revokeSessionByToken(secondLogin.rawSessionToken, handle.db);
    expect(await getValidatedSessionByToken(secondLogin.rawSessionToken, handle.db)).toBeNull();
  });

  it('resolve contexto de /[orgSlug] apenas para membros ativos e rejeita outra organização com NotFoundError (404)', async () => {
    const org2 = await provisionOrganization(
      {
        name: 'Atlas Consultoria Societária',
        slug: 'atlas-consultoria',
        adminEmail: 'diretoria@atlas.leg.br',
      },
      handle.db,
    );

    const loginMariana = await authenticateWithEmailPassword(
      {
        email: 'mariana@vertice.leg.br',
        password: 'NovaSenhaForte!2027',
      },
      handle.db,
    );

    // Mariana acessa sua própria organização (/vertice-societario) com sucesso
    const ctxVertice = await resolveOfficeTenantContext(
      {
        userId: loginMariana.userId,
        orgSlug: 'vertice-societario',
      },
      handle.db,
    );
    expect(ctxVertice.orgSlug).toBe('vertice-societario');
    expect(ctxVertice.role).toBe('org_admin');

    // Mariana tenta acessar outra organização (/atlas-consultoria) -> 404 NotFoundError
    await expect(
      resolveOfficeTenantContext(
        {
          userId: loginMariana.userId,
          orgSlug: org2.slug,
        },
        handle.db,
      ),
    ).rejects.toThrow(NotFoundError);

    // Mariana tenta acessar slug inexistente -> 404 NotFoundError
    await expect(
      resolveOfficeTenantContext(
        {
          userId: loginMariana.userId,
          orgSlug: 'organizacao-inexistente',
        },
        handle.db,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

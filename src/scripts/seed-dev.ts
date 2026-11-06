import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { getServerEnv } from '@/env';
import { hashPassword } from '@/server/auth/crypto';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { resolveRuntimeOrEmbeddedDb } from '@/server/db/client';
import { accounts, organizations, users } from '@/server/db/schema';
import { createClient, listOrganizationClients } from '@/server/modules/clients/service';
import { createCompany, listOrganizationCompanies } from '@/server/modules/companies/service';
import {
  addDemandComment,
  createDemand,
  listDemandCatalogMetadata,
  listOrganizationDemands,
  transitionDemandStage,
} from '@/server/modules/demands/service';
import {
  assignMemberToDepartment,
  createDepartment,
  listOrganizationDepartments,
} from '@/server/modules/departments/service';
import {
  inviteOrganizationMember,
  listOrganizationMembers,
} from '@/server/modules/members/service';
import { acceptInvitation, provisionOrganization } from '@/server/modules/organizations/service';

const SEED_ORG_SLUG = 'legaas-demo';
const SEED_ORG_NAME = 'Legaas Demonstração Operacional';

const ADMIN_EMAIL = 'admin@demo.leg.br';
const ADMIN_NAME = 'Dr. Paulo Campagnoli (Admin)';
const ADMIN_PASSWORD = 'Admin@123456';

const ANALYST_EMAIL = 'analista@demo.leg.br';
const ANALYST_NAME = 'Camila Ferreira (Analista)';
const ANALYST_PASSWORD = 'User@123456';

const PENDING_INVITE_EMAIL = 'convidado@demo.leg.br';

async function ensureClusterDatabasesAndRoles(ownerUrl: string): Promise<void> {
  const parsed = new URL(ownerUrl);
  parsed.pathname = '/postgres';
  const adminSql = postgres(parsed.toString(), { max: 1, connect_timeout: 10 });

  try {
    await adminSql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'legaas_app') THEN
          CREATE ROLE legaas_app WITH
            LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOBYPASSRLS
            PASSWORD 'legaas_app_dev_password';
        END IF;
      END
      $$;
    `);

    for (const dbName of ['legaas_dev', 'legaas_test']) {
      const existing = await adminSql`
        SELECT 1 FROM pg_database WHERE datname = ${dbName}
      `;
      if (existing.length === 0) {
        await adminSql.unsafe(`CREATE DATABASE ${dbName} OWNER legaas_owner`);
      }
    }
  } finally {
    await adminSql.end();
  }

  for (const dbName of ['legaas_dev', 'legaas_test']) {
    const dbUrl = new URL(ownerUrl);
    dbUrl.pathname = `/${dbName}`;
    const dbSql = postgres(dbUrl.toString(), { max: 1, connect_timeout: 10 });
    try {
      await dbSql.unsafe(`
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";
        CREATE EXTENSION IF NOT EXISTS "citext";
        GRANT CONNECT ON DATABASE ${dbName} TO legaas_app;
        GRANT USAGE ON SCHEMA public TO legaas_app;
        ALTER DEFAULT PRIVILEGES FOR ROLE legaas_owner IN SCHEMA public
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO legaas_app;
        ALTER DEFAULT PRIVILEGES FOR ROLE legaas_owner IN SCHEMA public
          GRANT USAGE, SELECT ON SEQUENCES TO legaas_app;
      `);
    } finally {
      await dbSql.end();
    }
  }
}

async function ensureMigrationsApplied(sqlClient: postgres.Sql): Promise<void> {
  const existsRows = await sqlClient<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'organizations'
    ) AS exists
  `;
  const exists = Boolean(existsRows[0]?.exists);

  const fnRows = await sqlClient<Array<{ fn_exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = 'legaas_accept_invitation'
    ) AS fn_exists
  `;
  const fnExists = Boolean(fnRows[0]?.fn_exists);

  if (exists && fnExists) {
    return;
  }

  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (exists && (file.startsWith('0000_') || file.startsWith('0001_'))) {
      continue;
    }
    const content = fs.readFileSync(path.join(drizzleDir, file), 'utf8');
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      await sqlClient.unsafe(stmt);
    }
  }
}

async function main() {
  const env = getServerEnv();
  await ensureClusterDatabasesAndRoles(env.DATABASE_OWNER_URL ?? env.DATABASE_URL);

  const ownerHandle = await resolveRuntimeOrEmbeddedDb(true);
  const appHandle = await resolveRuntimeOrEmbeddedDb(false);

  try {
    await ensureMigrationsApplied(ownerHandle.sqlClient);

    const existingOrg = await ownerHandle.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, SEED_ORG_SLUG))
      .limit(1);

    if (existingOrg.length === 0) {
      const provisioned = await provisionOrganization(
        {
          name: SEED_ORG_NAME,
          slug: SEED_ORG_SLUG,
          adminEmail: ADMIN_EMAIL,
          timezone: 'America/Sao_Paulo',
        },
        ownerHandle.db,
      );

      await acceptInvitation(
        {
          rawToken: provisioned.rawInviteToken,
          name: ADMIN_NAME,
          password: ADMIN_PASSWORD,
        },
        appHandle.db,
      );
    } else {
      const [adminUser] = await ownerHandle.db
        .select()
        .from(users)
        .where(eq(users.email, ADMIN_EMAIL))
        .limit(1);

      if (adminUser) {
        const passwordHash = await hashPassword(ADMIN_PASSWORD);
        await ownerHandle.db
          .update(accounts)
          .set({ password: passwordHash, updatedAt: new Date() })
          .where(eq(accounts.userId, adminUser.id));
      }
    }

    const [adminUser] = await ownerHandle.db
      .select()
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL))
      .limit(1);

    if (!adminUser) {
      throw new Error('Falha ao localizar usuário administrador após provisionamento.');
    }

    const adminCtx = await resolveOfficeTenantContext(
      {
        userId: adminUser.id,
        orgSlug: SEED_ORG_SLUG,
      },
      appHandle.db,
    );

    const directory = await listOrganizationMembers(adminCtx, appHandle.db);
    let analystMember = directory.members.find((m) => m.email === ANALYST_EMAIL);

    if (!analystMember) {
      const inviteAnalyst = await inviteOrganizationMember(
        adminCtx,
        {
          email: ANALYST_EMAIL,
          role: 'analyst',
        },
        appHandle.db,
      );

      await acceptInvitation(
        {
          rawToken: inviteAnalyst.rawInviteToken,
          name: ANALYST_NAME,
          password: ANALYST_PASSWORD,
        },
        appHandle.db,
      );

      const updatedDir = await listOrganizationMembers(adminCtx, appHandle.db);
      analystMember = updatedDir.members.find((m) => m.email === ANALYST_EMAIL);
    } else {
      const passwordHash = await hashPassword(ANALYST_PASSWORD);
      await ownerHandle.db
        .update(accounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(accounts.userId, analystMember.userId));
    }

    const existingDepts = await listOrganizationDepartments(adminCtx, appHandle.db);
    let deptSocietario = existingDepts.find((d) => d.name === 'Societário e Paralegal');
    if (!deptSocietario) {
      const created = await createDepartment(
        adminCtx,
        {
          name: 'Societário e Paralegal',
          description:
            'Constituição, alterações contratuais, atas e registros em Juntas Comerciais',
        },
        appHandle.db,
      );
      deptSocietario = {
        id: created.id,
        name: created.name,
        description: null,
        participants: [],
        createdAt: new Date(),
      };
    }

    let deptLicencas = existingDepts.find((d) => d.name === 'Alvarás e Licenciamento');
    if (!deptLicencas) {
      const created = await createDepartment(
        adminCtx,
        {
          name: 'Alvarás e Licenciamento',
          description: 'Licenças municipais, estaduais, Corpo de Bombeiros e Vigilância Sanitária',
        },
        appHandle.db,
      );
      deptLicencas = {
        id: created.id,
        name: created.name,
        description: null,
        participants: [],
        createdAt: new Date(),
      };
    }

    await assignMemberToDepartment(
      adminCtx,
      {
        departmentId: deptSocietario.id,
        membershipId: adminCtx.membershipId,
        departmentRole: 'manager',
      },
      appHandle.db,
    );

    if (analystMember) {
      await assignMemberToDepartment(
        adminCtx,
        {
          departmentId: deptSocietario.id,
          membershipId: analystMember.membershipId,
          departmentRole: 'member',
        },
        appHandle.db,
      );

      await assignMemberToDepartment(
        adminCtx,
        {
          departmentId: deptLicencas.id,
          membershipId: analystMember.membershipId,
          departmentRole: 'coordinator',
        },
        appHandle.db,
      );
    }

    const existingClients = await listOrganizationClients(adminCtx, {}, appHandle.db);
    let demoClientId = existingClients[0]?.id;
    if (!demoClientId) {
      const createdClient = await createClient(
        adminCtx,
        {
          type: 'organization',
          name: 'Grupo Horizonte Participações',
          taxId: '12345678000190',
          email: 'juridico@horizonte.com.br',
          phone: '(11) 3000-1000',
          ownerMembershipId: adminCtx.membershipId,
          notes: 'Grupo empresarial atendido em demandas societárias e licenciamento.',
          primaryContact: {
            name: 'Dra. Fernanda Lima',
            email: 'fernanda@horizonte.com.br',
            phone: '(11) 98888-1111',
            position: 'Diretora Jurídica',
          },
        },
        appHandle.db,
      );
      demoClientId = createdClient.id;
    }

    const existingCompanies = await listOrganizationCompanies(adminCtx, {}, appHandle.db);
    if (existingCompanies.length === 0 && demoClientId) {
      const holding = await createCompany(
        adminCtx,
        {
          clientId: demoClientId,
          cnpj: '12345678000190',
          legalName: 'Horizonte Holding Participações S.A.',
          tradeName: 'Horizonte Holding',
          stateRegistration: 'Isento',
          municipalRegistration: '998877-1',
          addressStreet: 'Av. Brigadeiro Faria Lima',
          addressNumber: '3500',
          addressComplement: '10º Andar',
          addressDistrict: 'Itaim Bibi',
          addressCity: 'São Paulo',
          addressState: 'SP',
          addressZipCode: '04538132',
        },
        appHandle.db,
      );

      await createCompany(
        adminCtx,
        {
          clientId: demoClientId,
          parentCompanyId: holding.id,
          cnpj: '12345678000271',
          legalName: 'Horizonte Logística Integrada Ltda.',
          tradeName: 'Horizonte Log',
          stateRegistration: '110.220.330.114',
          municipalRegistration: '445566-2',
          addressStreet: 'Rod. Anhanguera',
          addressNumber: 'Km 104',
          addressDistrict: 'Distrito Industrial',
          addressCity: 'Campinas',
          addressState: 'SP',
          addressZipCode: '13065900',
        },
        appHandle.db,
      );
    }

    const allCompanies = await listOrganizationCompanies(adminCtx, {}, appHandle.db);
    const existingDemands = await listOrganizationDemands(adminCtx, {}, appHandle.db);
    if (existingDemands.length === 0 && demoClientId && allCompanies.length > 0) {
      const catalog = await listDemandCatalogMetadata(adminCtx, appHandle.db);
      const activeStage = catalog.stages.find((s) => s.category === 'active');
      const waitingStage = catalog.stages.find((s) => s.category === 'waiting');

      const dem1 = await createDemand(
        adminCtx,
        {
          title: 'Alteração Contratual de Consolidação Societária e Ingresso de Sócio',
          description:
            'Elaboração da 4ª Alteração e Consolidação do Contrato Social, coleta de assinaturas ICP-Brasil e protocolo perante a JUCESP.',
          clientId: demoClientId,
          companyId: allCompanies[0]!.id,
          departmentId: deptSocietario.id,
          assigneeMembershipId: analystMember?.membershipId ?? adminCtx.membershipId,
          priority: 'high',
          dueDate: '2026-12-15',
        },
        appHandle.db,
      );

      if (activeStage) {
        await transitionDemandStage(
          adminCtx,
          {
            demandId: dem1.id,
            toStageId: activeStage.id,
            note: 'Minuta societária elaborada e validada com a diretoria jurídica do cliente.',
          },
          appHandle.db,
        );
      }

      await addDemandComment(
        adminCtx,
        {
          demandId: dem1.id,
          body: 'Certidões negativas federais e estaduais conferidas. Aguardando assinatura digital dos representantes.',
        },
        appHandle.db,
      );

      const dem2 = await createDemand(
        adminCtx,
        {
          title: 'Renovação de Alvará de Funcionamento e AVCB da Filial Logística',
          description:
            'Vistoria técnica prévia, renovação de AVCB junto ao Corpo de Bombeiros e atualização de licença municipal de operação em Campinas/SP.',
          clientId: demoClientId,
          companyId: (allCompanies[1] ?? allCompanies[0])!.id,
          departmentId: deptLicencas.id,
          assigneeMembershipId: analystMember?.membershipId ?? adminCtx.membershipId,
          priority: 'urgent',
          dueDate: '2026-11-30',
        },
        appHandle.db,
      );

      if (waitingStage) {
        await transitionDemandStage(
          adminCtx,
          {
            demandId: dem2.id,
            toStageId: waitingStage.id,
            note: 'Protocolado pedido de vistoria; aguardando emissão de parecer técnico do órgão.',
          },
          appHandle.db,
        );
      }
    }

    const pendingInvite = await inviteOrganizationMember(
      adminCtx,
      {
        email: PENDING_INVITE_EMAIL,
        role: 'coordinator',
      },
      appHandle.db,
    );

    const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    const pendingInviteUrl = `${baseUrl}/convite/${pendingInvite.rawInviteToken}`;

    console.log('\n============================================================');
    console.log('SEED DE DESENVOLVIMENTO CONCLUÍDO COM SUCESSO');
    console.log('============================================================');
    console.log(`Organização Padrão : ${SEED_ORG_NAME} (/${SEED_ORG_SLUG})`);
    console.log(`URL de Login       : ${baseUrl}/login`);
    console.log(`Dashboard Office   : ${baseUrl}/${SEED_ORG_SLUG}`);
    console.log('------------------------------------------------------------');
    console.log('1) Usuário Administrador (org_admin):');
    console.log(`   E-mail : ${ADMIN_EMAIL}`);
    console.log(`   Senha  : ${ADMIN_PASSWORD}`);
    console.log('------------------------------------------------------------');
    console.log('2) Usuária Analista / Equipe (analyst):');
    console.log(`   E-mail : ${ANALYST_EMAIL}`);
    console.log(`   Senha  : ${ANALYST_PASSWORD}`);
    console.log('------------------------------------------------------------');
    console.log('3) Link de Convite Pendente Ativo (para testar /convite/[token]):');
    console.log(`   E-mail convidado : ${PENDING_INVITE_EMAIL} (papel: coordinator)`);
    console.log(`   Link de aceite   : ${pendingInviteUrl}`);
    console.log('============================================================\n');
  } finally {
    await appHandle.close();
    await ownerHandle.close();
  }
}

main().catch((err) => {
  console.error('Erro ao executar seed de desenvolvimento:', err);
  process.exit(1);
});

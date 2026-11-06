import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { getServerEnv } from '@/env';
import { hashPassword } from '@/server/auth/crypto';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { resolveRuntimeOrEmbeddedDb } from '@/server/db/client';
import { accounts, organizations, users } from '@/server/db/schema';
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

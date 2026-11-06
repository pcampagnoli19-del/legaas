import { parseArgs } from 'node:util';
import { getServerEnv } from '@/env';
import { resolveRuntimeOrEmbeddedDb } from '@/server/db/client';
import { provisionOrganization } from '@/server/modules/organizations/service';

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      slug: { type: 'string' },
      email: { type: 'string' },
      timezone: { type: 'string', default: 'America/Sao_Paulo' },
    },
  });

  if (!values.name || !values.slug || !values.email) {
    console.error(
      'Uso: pnpm org:provision --name "Nome da Organização" --slug "slug-da-org" --email "admin@dominio.com.br"',
    );
    process.exit(1);
  }

  const env = getServerEnv();
  const handle = await resolveRuntimeOrEmbeddedDb(true);

  try {
    const provisioned = await provisionOrganization(
      {
        name: values.name,
        slug: values.slug,
        adminEmail: values.email,
        timezone: values.timezone,
      },
      handle.db,
    );

    const inviteUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/convite/${provisioned.rawInviteToken}`;

    console.log('\n============================================================');
    console.log('ORGANIZAÇÃO PROVISIONADA COM SUCESSO (Decisão A4)');
    console.log('============================================================');
    console.log(`Organização : ${provisioned.name}`);
    console.log(`Slug        : /${provisioned.slug}`);
    console.log(`ID          : ${provisioned.organizationId}`);
    console.log(`Admin E-mail: ${provisioned.adminEmail}`);
    console.log(`Expira em   : ${provisioned.inviteExpiresAt.toISOString()}`);
    console.log('------------------------------------------------------------');
    console.log('Link de Convite de Uso Único (envie ao Administrador):');
    console.log(inviteUrl);
    console.log('============================================================\n');
  } finally {
    await handle.close();
  }
}

main().catch((err) => {
  console.error('Falha ao provisionar organização:', err);
  process.exit(1);
});

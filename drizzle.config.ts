import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_OWNER_URL ??
      process.env.DATABASE_URL ??
      'postgresql://legaas_owner:legaas_owner_dev_password@localhost:5432/legaas_dev',
  },
  strict: true,
  verbose: true,
});

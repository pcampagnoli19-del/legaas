-- =============================================================================
-- LEGAAS — Inicialização do PostgreSQL local (Desenvolvimento & Testes)
-- Cria:
--   1. Role `legaas_app` SEM BYPASSRLS e SEM SUPERUSER (usada pelo runtime).
--   2. Banco `legaas_test` (além do `legaas_dev` criado por POSTGRES_DB).
--   3. Extensões e privilégios padrão em ambos os bancos.
-- =============================================================================

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

SELECT 'CREATE DATABASE legaas_test OWNER legaas_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'legaas_test')\gexec

\connect legaas_dev
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
GRANT CONNECT ON DATABASE legaas_dev TO legaas_app;
GRANT USAGE ON SCHEMA public TO legaas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE legaas_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO legaas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE legaas_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO legaas_app;

\connect legaas_test
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
GRANT CONNECT ON DATABASE legaas_test TO legaas_app;
GRANT USAGE ON SCHEMA public TO legaas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE legaas_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO legaas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE legaas_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO legaas_app;

-- =============================================================================
-- LEGAAS — Migration 0001: Row-Level Security (RLS) Obrigatório & Append-Only Audit
-- Garante isolamento multi-tenant na camada de persistência (PostgreSQL):
--   1. Role `legaas_app` sem BYPASSRLS e sem SUPERUSER.
--   2. Função estável `public.current_org_id()` lendo `app.current_org_id`.
--   3. ENABLE + FORCE ROW LEVEL SECURITY em todas as tabelas com `organization_id`
--      e na tabela `organizations`.
--   4. Política `tenant_isolation_policy` exigindo `organization_id = public.current_org_id()`.
--      Se `app.current_org_id` não estiver definido na transação, `current_org_id()`
--      retorna NULL e nenhuma linha é visível ou inserível.
--   5. `activity_log` append-only: revoga UPDATE, DELETE e TRUNCATE de `legaas_app`.
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
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO legaas_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legaas_app;
--> statement-breakpoint

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legaas_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.current_org_id() TO legaas_app;
--> statement-breakpoint

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "organizations_tenant_isolation_policy" ON "organizations";
--> statement-breakpoint
CREATE POLICY "organizations_tenant_isolation_policy" ON "organizations"
  AS PERMISSIVE
  FOR ALL
  TO legaas_app
  USING ("id" = public.current_org_id())
  WITH CHECK ("id" = public.current_org_id());
--> statement-breakpoint

DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'memberships',
    'invitations',
    'departments',
    'department_members',
    'org_counters',
    'clients',
    'client_contacts',
    'companies',
    'service_categories',
    'workflows',
    'workflow_stages',
    'workflow_transitions',
    'service_types',
    'demands',
    'demand_participants',
    'demand_stage_history',
    'comments',
    'tasks',
    'deadlines',
    'document_categories',
    'documents',
    'activity_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON public.%I AS PERMISSIVE FOR ALL TO legaas_app USING (organization_id = public.current_org_id()) WITH CHECK (organization_id = public.current_org_id())',
      tbl
    );
  END LOOP;
END
$$;
--> statement-breakpoint

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.activity_log FROM legaas_app;
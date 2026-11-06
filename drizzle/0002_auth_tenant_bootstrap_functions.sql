-- =============================================================================
-- LEGAAS — Migration 0002: Funções seguras de resolução de Tenant e Convite
-- Como `organizations`, `memberships` e `invitations` possuem FORCE RLS exigindo
-- `app.current_org_id`, estas 3 funções `SECURITY DEFINER` (com `search_path` fixo
-- em `public`) permitem exclusivamente:
--   1. Resolver `(user_id, org_slug)` -> membership ativa na organização.
--   2. Listar as organizações ativas às quais um `user_id` pertence.
--   3. Consultar um convite pelo `token_hash` SHA-256 exato.
-- Nenhuma listagem arbitrária entre organizações é exposta à role `legaas_app`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_user_org_membership(
  p_user_id uuid,
  p_org_slug text
)
RETURNS TABLE (
  organization_id uuid,
  org_name text,
  org_slug text,
  org_timezone text,
  membership_id uuid,
  membership_kind public.membership_kind,
  membership_role public.membership_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id AS organization_id,
    o.name AS org_name,
    o.slug AS org_slug,
    o.timezone AS org_timezone,
    m.id AS membership_id,
    m.kind AS membership_kind,
    m.role AS membership_role
  FROM public.organizations o
  INNER JOIN public.memberships m
    ON m.organization_id = o.id
  INNER JOIN public.users u
    ON u.id = m.user_id
  WHERE o.slug = p_org_slug
    AND o.status = 'active'
    AND m.user_id = p_user_id
    AND m.status = 'active'
    AND u.status = 'active'
  LIMIT 1;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.resolve_user_org_membership(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_user_org_membership(uuid, text) TO legaas_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.list_user_organizations(
  p_user_id uuid
)
RETURNS TABLE (
  organization_id uuid,
  org_name text,
  org_slug text,
  membership_id uuid,
  membership_kind public.membership_kind,
  membership_role public.membership_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id AS organization_id,
    o.name AS org_name,
    o.slug AS org_slug,
    m.id AS membership_id,
    m.kind AS membership_kind,
    m.role AS membership_role
  FROM public.memberships m
  INNER JOIN public.organizations o
    ON o.id = m.organization_id
  INNER JOIN public.users u
    ON u.id = m.user_id
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
    AND o.status = 'active'
    AND u.status = 'active'
  ORDER BY o.name ASC;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.list_user_organizations(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_user_organizations(uuid) TO legaas_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.inspect_invitation_by_token_hash(
  p_token_hash text
)
RETURNS TABLE (
  invitation_id uuid,
  organization_id uuid,
  org_name text,
  org_slug text,
  email text,
  kind public.membership_kind,
  role public.membership_role,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id AS invitation_id,
    i.organization_id,
    o.name AS org_name,
    o.slug AS org_slug,
    i.email,
    i.kind,
    i.role,
    i.expires_at,
    i.accepted_at,
    i.revoked_at
  FROM public.invitations i
  INNER JOIN public.organizations o
    ON o.id = i.organization_id
  WHERE i.token_hash = p_token_hash
    AND o.status = 'active'
  LIMIT 1;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.inspect_invitation_by_token_hash(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.inspect_invitation_by_token_hash(text) TO legaas_app;
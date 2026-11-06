import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import {
  listUserActiveOrganizations,
  resolveOfficeTenantContext,
} from '@/server/context/tenant-context';
import { NotFoundError } from '@/server/errors/app-error';
import { OfficeShell } from './_components/office-shell';

const ORG_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface OfficeOrgLayoutProps {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}

/**
 * Layout do ambiente interno Legaas Office (`/[orgSlug]/...` — Decisões A3 e Fase 1.1):
 * - Valida a sessão autenticada no servidor (`getCurrentSessionFromCookies`).
 * - Caso não haja sessão: redireciona para `/login?next=/[orgSlug]` (exceto o slug
 *   explícito `demonstracao-dev` em ambiente de desenvolvimento/teste — CLAUDE.md §3.3).
 * - Caso haja sessão: valida a `Membership` ativa do usuário na organização `orgSlug`
 *   no banco (`resolveOfficeTenantContext`). Se o usuário não pertencer à organização
 *   ou a organização não existir, retorna HTTP 404 (`notFound()`).
 */
export default async function OfficeOrgLayout({ children, params }: OfficeOrgLayoutProps) {
  const { orgSlug } = await params;

  if (!ORG_SLUG_REGEX.test(orgSlug) || orgSlug.length > 64) {
    notFound();
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Slug explícito de preview de desenvolvimento (CLAUDE.md §3.3)
  if (!isProduction && orgSlug === 'demonstracao-dev') {
    return (
      <OfficeShell
        orgSlug={orgSlug}
        orgDisplayName="Organização de Desenvolvimento (Preview)"
        isDevPreview={true}
      >
        {children}
      </OfficeShell>
    );
  }

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    redirect(`/login?next=/${encodeURIComponent(orgSlug)}`);
  }

  try {
    const [tenantCtx, userOrgs] = await Promise.all([
      resolveOfficeTenantContext({
        userId: session.userId,
        orgSlug,
      }),
      listUserActiveOrganizations(session.userId),
    ]);

    const internalOrgs = userOrgs
      .filter((o) => o.kind === 'internal')
      .map((o) => ({ orgSlug: o.orgSlug, orgName: o.orgName }));

    return (
      <OfficeShell
        orgSlug={tenantCtx.orgSlug}
        orgDisplayName={tenantCtx.orgName}
        isDevPreview={false}
        user={{
          name: session.name,
          email: session.email,
          role: tenantCtx.role,
        }}
        availableOrgs={internalOrgs}
      >
        {children}
      </OfficeShell>
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }
}

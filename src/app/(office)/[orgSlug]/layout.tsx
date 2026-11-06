import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { OfficeShell } from './_components/office-shell';

const ORG_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface OfficeOrgLayoutProps {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}

/**
 * Layout do ambiente interno Legaas Office (`/[orgSlug]/...` — Decisão A3).
 * Na Fase 0 (pré-autenticação da Fase 1.1), valida rigorosamente o formato do slug
 * e em produção bloqueia slugs de demonstração (CLAUDE.md §3.3).
 */
export default async function OfficeOrgLayout({ children, params }: OfficeOrgLayoutProps) {
  const { orgSlug } = await params;

  if (!ORG_SLUG_REGEX.test(orgSlug) || orgSlug.length > 64) {
    notFound();
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && orgSlug === 'demonstracao-dev') {
    notFound();
  }

  const orgDisplayName =
    orgSlug === 'demonstracao-dev' ? 'Organização de Desenvolvimento (Fase 0)' : orgSlug;

  return (
    <OfficeShell orgSlug={orgSlug} orgDisplayName={orgDisplayName} isDevPreview={!isProduction}>
      {children}
    </OfficeShell>
  );
}

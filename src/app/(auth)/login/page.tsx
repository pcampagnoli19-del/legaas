import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { listUserActiveOrganizations } from '@/server/context/tenant-context';
import { LoginForm } from './_components/login-form';

export const metadata: Metadata = {
  title: 'Entrar',
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  try {
    const session = await getCurrentSessionFromCookies();
    if (session) {
      const orgs = await listUserActiveOrganizations(session.userId);
      const firstInternal = orgs.find((o) => o.kind === 'internal');
      if (firstInternal) {
        redirect(`/${firstInternal.orgSlug}`);
      }
    }
  } catch {
    // Se o banco não estiver acessível no momento da renderização da tela de login, exibe o formulário normalmente
  }

  return <LoginForm nextPath={next} />;
}

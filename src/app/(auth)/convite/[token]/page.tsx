import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { inspectInvitationToken } from '@/server/modules/organizations/service';
import { AcceptInviteForm } from './_components/accept-invite-form';

export const metadata: Metadata = {
  title: 'Aceitar Convite',
};

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const inspected = await inspectInvitationToken(token);

  if (
    inspected.status !== 'valid' ||
    !inspected.organizationName ||
    !inspected.email ||
    !inspected.role
  ) {
    const titleByStatus = {
      accepted: 'Convite já utilizado',
      expired: 'Convite expirado',
      revoked: 'Convite revogado',
      not_found: 'Convite inválido',
    } as const;

    const descriptionByStatus = {
      accepted:
        'Este convite de uso único já foi utilizado para ativar uma conta. Acesse a tela de login com suas credenciais.',
      expired:
        'O prazo de validade deste convite encerrou. Solicite um novo convite ao administrador da organização.',
      revoked: 'Este convite foi cancelado pelo administrador da organização.',
      not_found: 'O link de convite informado não corresponde a nenhum registro ativo.',
    } as const;

    const statusKey = inspected.status === 'valid' ? 'not_found' : inspected.status;

    return (
      <Card>
        <CardHeader>
          <CardTitle>{titleByStatus[statusKey]}</CardTitle>
          <CardDescription>{descriptionByStatus[statusKey]}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/login"
            className="bg-brand-navy inline-flex items-center justify-center rounded-md px-3.5 py-2 text-xs font-medium text-white"
          >
            Ir para o login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <AcceptInviteForm
      rawToken={token}
      organizationName={inspected.organizationName}
      email={inspected.email}
      role={inspected.role}
    />
  );
}

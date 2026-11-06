'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { acceptInvitationAction } from '@/server/auth/actions';
import type { MembershipRole } from '@/server/context/tenant-context';

const ROLE_LABELS: Record<MembershipRole, string> = {
  org_admin: 'Administrador da Organização',
  manager: 'Gestor',
  coordinator: 'Coordenador',
  analyst: 'Analista',
  viewer: 'Visualizador',
  external: 'Usuário Externo',
};

export interface AcceptInviteFormProps {
  rawToken: string;
  organizationName: string;
  email: string;
  role: MembershipRole;
}

export function AcceptInviteForm({
  rawToken,
  organizationName,
  email,
  role,
}: AcceptInviteFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await acceptInvitationAction({
        rawToken,
        name,
        password,
        confirmPassword,
      });

      if (!result.ok) {
        if (result.error.fieldErrors) {
          setFieldErrors(result.error.fieldErrors);
        }
        setError(result.error.message);
        setSubmitting(false);
        return;
      }

      router.push(result.data.redirectTo);
      router.refresh();
    } catch {
      setError('Não foi possível concluir o aceite do convite.');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex items-center justify-between">
          <Badge variant="emerald">Convite Corporativo</Badge>
          <Badge variant="outline">{ROLE_LABELS[role] ?? role}</Badge>
        </div>
        <CardTitle>Ingressar em {organizationName}</CardTitle>
        <CardDescription>
          Complete seu cadastro para ativar seu vínculo com a organização no Legaas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {error}
            </div>
          ) : null}

          <FormField id="invite-email" label="E-mail convidado">
            <Input id="invite-email" value={email} disabled readOnly />
          </FormField>

          <FormField id="invite-name" label="Seu nome completo" required errors={fieldErrors.name}>
            <Input
              id="invite-name"
              name="name"
              placeholder="Ex.: Dra. Mariana Souza"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              required
            />
          </FormField>

          <FormField
            id="invite-password"
            label="Defina uma senha de acesso"
            required
            hint="Mínimo de 8 caracteres."
            errors={fieldErrors.password}
          >
            <Input
              id="invite-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
            />
          </FormField>

          <FormField
            id="invite-confirm-password"
            label="Confirmar senha"
            required
            errors={fieldErrors.confirmPassword}
          >
            <Input
              id="invite-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              required
            />
          </FormField>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Ativando acesso...' : 'Aceitar convite e acessar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

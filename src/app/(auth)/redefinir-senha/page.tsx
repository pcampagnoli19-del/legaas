'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { resetPasswordAction } from '@/server/auth/actions';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const rawToken = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await resetPasswordAction({
        rawToken,
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

      setSuccessMessage(result.data.message);
      setSubmitting(false);
    } catch {
      setError('Não foi possível redefinir a senha no momento.');
      setSubmitting(false);
    }
  }

  if (!rawToken) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link de redefinição ausente</CardTitle>
          <CardDescription>
            O endereço acessado não contém um token de recuperação válido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/recuperar-senha" className="text-brand-navy text-xs font-medium underline">
            Solicitar um novo link de recuperação
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Definir nova senha</CardTitle>
        <CardDescription>
          Ao redefinir sua senha, todas as sessões anteriores serão encerradas automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {successMessage ? (
          <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p>{successMessage}</p>
            <Link
              href="/login"
              className="bg-brand-navy inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-white"
            >
              Ir para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error ? (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {error}
              </div>
            ) : null}

            <FormField
              id="reset-password"
              label="Nova senha"
              required
              hint="Mínimo de 8 caracteres."
              errors={fieldErrors.password}
            >
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </FormField>

            <FormField
              id="reset-confirm-password"
              label="Confirmar nova senha"
              required
              errors={fieldErrors.confirmPassword}
            >
              <Input
                id="reset-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </FormField>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Redefinindo...' : 'Salvar nova senha'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="text-xs text-slate-500">
            Carregando formulário de redefinição...
          </CardContent>
        </Card>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

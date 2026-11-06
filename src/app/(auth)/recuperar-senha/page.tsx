'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requestPasswordResetAction } from '@/server/auth/actions';

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [devResetPath, setDevResetPath] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    setConfirmationMessage(null);
    setDevResetPath(null);

    try {
      const result = await requestPasswordResetAction({ email });

      if (!result.ok) {
        if (result.error.fieldErrors) {
          setFieldErrors(result.error.fieldErrors);
        }
        setError(result.error.message);
        setSubmitting(false);
        return;
      }

      setConfirmationMessage(result.data.message);
      if (result.data.devResetPath) {
        setDevResetPath(result.data.devResetPath);
      }
      setSubmitting(false);
    } catch {
      setError('Não foi possível solicitar a recuperação no momento.');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>
          Informe o seu e-mail corporativo para receber um link de redefinição de uso único (válido
          por 1 hora).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {confirmationMessage ? (
          <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p>{confirmationMessage}</p>
            {devResetPath ? (
              <div className="rounded-xs border border-emerald-300 bg-white p-2 font-mono text-[11px]">
                <span className="font-semibold text-slate-700">[Ambiente Dev] Link: </span>
                <Link
                  href={devResetPath}
                  className="text-brand-navy underline hover:text-emerald-700"
                >
                  {devResetPath}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField
            id="recover-email"
            label="E-mail corporativo"
            required
            errors={fieldErrors.email}
          >
            <Input
              id="recover-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="nome@suaorganizacao.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
            />
          </FormField>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Enviando instruções...' : 'Enviar link de recuperação'}
          </Button>
        </form>

        <div className="border-t border-slate-100 pt-3 text-center">
          <Link
            href="/login"
            className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
          >
            Voltar para o login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

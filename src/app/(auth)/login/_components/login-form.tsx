'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { loginAction } from '@/server/auth/actions';

export interface LoginFormProps {
  nextPath?: string;
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setGeneralError(null);
    setFieldErrors({});

    try {
      const result = await loginAction({
        email,
        password,
        nextPath,
      });

      if (!result.ok) {
        if (result.error.fieldErrors) {
          setFieldErrors(result.error.fieldErrors);
        }
        setGeneralError(result.error.message);
        setSubmitting(false);
        return;
      }

      router.push(result.data.redirectTo);
      router.refresh();
    } catch {
      setGeneralError('Não foi possível processar o login. Tente novamente.');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar no Legaas Office</CardTitle>
        <CardDescription>
          Utilize seu e-mail corporativo e senha para acessar o ambiente da sua organização.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {generalError ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {generalError}
            </div>
          ) : null}

          <FormField
            id="login-email"
            label="E-mail corporativo"
            required
            errors={fieldErrors.email}
          >
            <Input
              id="login-email"
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

          <FormField id="login-password" label="Senha" required errors={fieldErrors.password}>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              required
            />
          </FormField>

          <div className="flex items-center justify-between pt-1">
            <Link
              href="/recuperar-senha"
              className="text-xs font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
            >
              Esqueceu a senha?
            </Link>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Autenticando...' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

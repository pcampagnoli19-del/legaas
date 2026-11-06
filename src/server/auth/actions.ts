'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createValidatedAction } from '@/server/context/action';
import { ValidationError } from '@/server/errors/app-error';
import { logger } from '@/server/logger';
import { acceptInvitation } from '@/server/modules/organizations/service';
import {
  authenticateWithEmailPassword,
  requestPasswordReset,
  resetPasswordWithToken,
} from './service';
import { clearSessionAndCookie, createDatabaseSession, setSessionCookie } from './session';

const loginSchema = z.object({
  email: z.string().trim().email('Informe um endereço de e-mail válido.'),
  password: z.string().min(1, 'Informe a sua senha.'),
  nextPath: z.string().optional(),
});

const requestResetSchema = z.object({
  email: z.string().trim().email('Informe um endereço de e-mail válido.'),
});

const resetPasswordSchema = z
  .object({
    rawToken: z.string().min(16, 'Token de recuperação inválido.'),
    password: z
      .string()
      .min(8, 'A nova senha deve possuir no mínimo 8 caracteres.')
      .max(128, 'A senha deve possuir no máximo 128 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'A confirmação de senha não confere.',
  });

const acceptInviteSchema = z
  .object({
    rawToken: z.string().min(16, 'Token de convite inválido.'),
    name: z
      .string()
      .trim()
      .min(2, 'Informe o seu nome completo (mínimo 2 caracteres).')
      .max(120, 'Nome muito longo.'),
    password: z
      .string()
      .min(8, 'A senha deve possuir no mínimo 8 caracteres.')
      .max(128, 'A senha deve possuir no máximo 128 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'A confirmação de senha não confere.',
  });

function sanitizeRelativeRedirect(nextPath: string | undefined, fallback: string): string {
  if (
    nextPath &&
    nextPath.startsWith('/') &&
    !nextPath.startsWith('//') &&
    !nextPath.startsWith('/login')
  ) {
    return nextPath;
  }
  return fallback;
}

export const loginAction = createValidatedAction({
  name: 'auth.login',
  schema: loginSchema,
  handler: async (input) => {
    const reqHeaders = await headers();
    const ipAddress = reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = reqHeaders.get('user-agent') ?? null;

    const result = await authenticateWithEmailPassword({
      email: input.email,
      password: input.password,
      ipAddress,
      userAgent,
    });

    const internalOrgs = result.organizations.filter((o) => o.kind === 'internal');
    if (internalOrgs.length === 0) {
      throw new ValidationError(
        'Sua conta não possui vínculo ativo com nenhuma organização no Legaas Office.',
      );
    }

    await setSessionCookie(result.rawSessionToken, result.sessionExpiresAt);

    const defaultOrgSlug = internalOrgs[0]!.orgSlug;
    const redirectTo = sanitizeRelativeRedirect(input.nextPath, `/${defaultOrgSlug}`);

    return {
      redirectTo,
      organizationSlug: defaultOrgSlug,
    };
  },
});

export async function logoutAction(): Promise<never> {
  await clearSessionAndCookie();
  redirect('/login');
}

export const requestPasswordResetAction = createValidatedAction({
  name: 'auth.requestPasswordReset',
  schema: requestResetSchema,
  handler: async (input) => {
    const res = await requestPasswordReset({ email: input.email });

    if (res.issued && res.rawResetToken && process.env.NODE_ENV !== 'production') {
      logger.info(
        {
          email: input.email,
          resetUrl: `/redefinir-senha?token=${res.rawResetToken}`,
        },
        '[DEV] Token de recuperação de senha gerado',
      );
    }

    return {
      message:
        'Se o endereço informado estiver associado a uma conta ativa, as instruções de redefinição foram enviadas.',
      // Em ambiente não produtivo, retorna o link para facilitar homologação local sem servidor SMTP externo
      devResetPath:
        process.env.NODE_ENV !== 'production' && res.rawResetToken
          ? `/redefinir-senha?token=${res.rawResetToken}`
          : undefined,
    };
  },
});

export const resetPasswordAction = createValidatedAction({
  name: 'auth.resetPassword',
  schema: resetPasswordSchema,
  handler: async (input) => {
    await resetPasswordWithToken({
      rawToken: input.rawToken,
      newPassword: input.password,
    });

    return {
      message: 'Sua senha foi redefinida com sucesso. Faça login com a nova credencial.',
    };
  },
});

export const acceptInvitationAction = createValidatedAction({
  name: 'auth.acceptInvitation',
  schema: acceptInviteSchema,
  handler: async (input) => {
    const reqHeaders = await headers();
    const ipAddress = reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = reqHeaders.get('user-agent') ?? null;

    const accepted = await acceptInvitation({
      rawToken: input.rawToken,
      name: input.name,
      password: input.password,
    });

    const session = await createDatabaseSession({
      userId: accepted.userId,
      ipAddress,
      userAgent,
    });

    await setSessionCookie(session.rawToken, session.expiresAt);

    return {
      redirectTo: `/${accepted.organizationSlug}`,
      organizationSlug: accepted.organizationSlug,
    };
  },
});

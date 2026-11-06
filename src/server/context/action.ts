import { type z } from 'zod';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { assertPermission, type PermissionAction } from '@/server/authz/permissions';
import {
  type OfficeTenantContext,
  resolveOfficeTenantContext,
} from '@/server/context/tenant-context';
import {
  type ActionResult,
  AppError,
  UnauthorizedError,
  ValidationError,
} from '@/server/errors/app-error';
import { logger } from '@/server/logger';

function formatZodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    const list = fieldErrors[key] ?? [];
    list.push(issue.message);
    fieldErrors[key] = list;
  }
  return fieldErrors;
}

/**
 * Executa uma operação de servidor convertendo erros de domínio (`AppError`) em
 * respostas padronizadas e mascarando exceções inesperadas (sem vazar stack traces
 * ou detalhes de infraestrutura para o cliente).
 */
export async function executeSafeAction<T>(
  actionName: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, error: err.toPublicJSON() };
    }

    logger.error(
      {
        action: actionName,
        err:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : String(err),
      },
      'Exceção não tratada em ação do servidor',
    );

    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir a operação no momento. Tente novamente em instantes.',
      },
    };
  }
}

/**
 * Cria uma ação validada por schema Zod com retorno tipado `ActionResult<TOutput>`.
 */
export function createValidatedAction<TSchema extends z.ZodTypeAny, TOutput>(params: {
  name: string;
  schema: TSchema;
  handler: (input: z.infer<TSchema>) => Promise<TOutput>;
}): (rawInput: unknown) => Promise<ActionResult<TOutput>> {
  return async (rawInput: unknown): Promise<ActionResult<TOutput>> => {
    return executeSafeAction(params.name, async () => {
      const parsed = params.schema.safeParse(rawInput);
      if (!parsed.success) {
        throw new ValidationError(
          'Verifique os campos destacados e tente novamente.',
          formatZodFieldErrors(parsed.error),
        );
      }
      return params.handler(parsed.data);
    });
  };
}

/**
 * Pipeline obrigatório de Server Actions do Legaas Office (§4.2 da proposta técnica):
 * 1. Valida sessão autenticada via cookie `httpOnly`.
 * 2. Valida payload de entrada via Zod (incluindo `orgSlug`).
 * 3. Resolve `OfficeTenantContext` no servidor (`resolveOfficeTenantContext`), rejeitando com 404
 *    qualquer manipulação de `orgSlug` para outra organização.
 * 4. Valida a permissão RBAC (`assertPermission`) antes de executar a regra de domínio.
 */
export function createOfficeAction<
  TSchema extends z.ZodObject<{ orgSlug: z.ZodString } & z.ZodRawShape>,
  TOutput,
>(params: {
  name: string;
  permission?: PermissionAction;
  schema: TSchema;
  handler: (args: { ctx: OfficeTenantContext; input: z.infer<TSchema> }) => Promise<TOutput>;
}): (rawInput: unknown) => Promise<ActionResult<TOutput>> {
  return async (rawInput: unknown): Promise<ActionResult<TOutput>> => {
    return executeSafeAction(params.name, async () => {
      const session = await getCurrentSessionFromCookies();
      if (!session) {
        throw new UnauthorizedError();
      }

      const parsed = params.schema.safeParse(rawInput);
      if (!parsed.success) {
        throw new ValidationError(
          'Verifique os campos destacados e tente novamente.',
          formatZodFieldErrors(parsed.error),
        );
      }

      const input = parsed.data;
      const ctx = await resolveOfficeTenantContext({
        userId: session.userId,
        orgSlug: input.orgSlug,
      });

      if (params.permission) {
        assertPermission(ctx, params.permission);
      }

      return params.handler({ ctx, input });
    });
  };
}

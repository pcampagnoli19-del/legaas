import { type z } from 'zod';
import { type ActionResult, AppError, ValidationError } from '@/server/errors/app-error';
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

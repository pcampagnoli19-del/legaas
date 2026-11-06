import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createValidatedAction, executeSafeAction } from '@/server/context/action';
import { ForbiddenError, NotFoundError } from '@/server/errors/app-error';

describe('Tratamento de erros e wrapper de Server Actions', () => {
  it('retorna estruturadamente erros de validação do Zod por campo', async () => {
    const action = createValidatedAction({
      name: 'client.create',
      schema: z.object({
        name: z.string().min(3, 'O nome deve ter no mínimo 3 caracteres.'),
      }),
      handler: async (input) => ({ id: '1', name: input.name }),
    });

    const result = await action({ name: 'AB' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.fieldErrors?.name).toContain('O nome deve ter no mínimo 3 caracteres.');
    }
  });

  it('preserva código e mensagem de AppError operacionais (Forbidden / NotFound)', async () => {
    const forbidden = await executeSafeAction('demand.delete', async () => {
      throw new ForbiddenError('Apenas administradores podem excluir demandas.');
    });

    expect(forbidden).toEqual({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Apenas administradores podem excluir demandas.',
      },
    });

    const notFound = await executeSafeAction('org.resolve', async () => {
      throw new NotFoundError();
    });

    expect(notFound.ok).toBe(false);
    if (!notFound.ok) {
      expect(notFound.error.code).toBe('NOT_FOUND');
    }
  });

  it('mascara exceções inesperadas sem vazar detalhes internos ou stack trace', async () => {
    const result = await executeSafeAction('db.rawFailure', async () => {
      throw new Error('FATAL: password authentication failed for user legaas_owner');
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).not.toContain('legaas_owner');
      expect(result.error.message).not.toContain('password');
    }
  });
});

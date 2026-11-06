export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface SerializedAppError {
  code: AppErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: SerializedAppError };

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly fieldErrors?: Record<string, string[]>;
  public readonly isOperational: boolean;

  constructor(params: {
    code: AppErrorCode;
    message: string;
    statusCode: number;
    fieldErrors?: Record<string, string[]>;
    cause?: unknown;
    isOperational?: boolean;
  }) {
    super(params.message, { cause: params.cause });
    this.name = this.constructor.name;
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.fieldErrors = params.fieldErrors;
    this.isOperational = params.isOperational ?? true;
  }

  public toPublicJSON(): SerializedAppError {
    return {
      code: this.code,
      message: this.message,
      ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
    };
  }
}

export class ValidationError extends AppError {
  constructor(
    message = 'Os dados informados são inválidos.',
    fieldErrors?: Record<string, string[]>,
  ) {
    super({
      code: 'VALIDATION_ERROR',
      message,
      statusCode: 400,
      fieldErrors,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Sessão expirada ou não autenticada.') {
    super({
      code: 'UNAUTHORIZED',
      message,
      statusCode: 401,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Você não possui permissão para executar esta operação.') {
    super({
      code: 'FORBIDDEN',
      message,
      statusCode: 403,
    });
  }
}

/**
 * Usado também quando uma organização na URL (`/[orgSlug]`) não existe ou o usuário
 * não possui membership ativa nela (retorna 404 para não revelar existência do tenant).
 */
export class NotFoundError extends AppError {
  constructor(message = 'O recurso solicitado não foi encontrado.') {
    super({
      code: 'NOT_FOUND',
      message,
      statusCode: 404,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Já existe um registro conflitante com os dados informados.') {
    super({
      code: 'CONFLICT',
      message,
      statusCode: 409,
    });
  }
}

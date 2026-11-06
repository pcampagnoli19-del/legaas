import pino from 'pino';

const REDACTED_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'tokenHash',
  '*.tokenHash',
  'secret',
  '*.secret',
  'authorization',
  'headers.authorization',
  'cookie',
  'headers.cookie',
  'taxId',
  '*.taxId',
  'cnpj',
  '*.cnpj',
];

export const logger = pino({
  name: 'legaas',
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

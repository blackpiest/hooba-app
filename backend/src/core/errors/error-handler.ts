import type { FastifyInstance } from 'fastify';
import { AppError } from './app-error.js';
import { fail } from '../http/response.js';

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

/** Ошибки Fastify с 4xx (битый JSON, слишком большое тело, чужой Content-Type) — вина клиента, а не 500. */
function clientErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
  const status = (error as { statusCode: unknown }).statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(fail(error.code, error.message));
    }
    const status = clientErrorStatus(error);
    if (status !== null) {
      const message = error instanceof Error && error.message ? error.message : 'Bad request';
      return reply.status(status).send(fail(CLIENT_ERROR_CODES[status] ?? 'BAD_REQUEST', message));
    }
    request.log.error(error);
    return reply.status(500).send(fail('INTERNAL_ERROR', 'Unexpected error'));
  });
}

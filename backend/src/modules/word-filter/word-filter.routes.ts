import type { FastifyInstance } from 'fastify';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { requireOwner } from '../auth/auth.middleware.js';
import { patchBannedWordsBodySchema } from './word-filter.schemas.js';
import * as wordFilterService from './word-filter.service.js';

export async function registerWordFilterRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/word-filter',
    { preHandler: requireOwner },
    async (_request, reply) => {
      return reply.send(ok(await wordFilterService.getBannedWords()));
    },
  );

  app.patch(
    '/api/v1/word-filter',
    { preHandler: requireOwner },
    async (request, reply) => {
      const parsed = patchBannedWordsBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new AppError('VALIDATION_ERROR', 400, first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body');
      }
      if (!consumeRateLimit(`word-filter:edit:${request.auth?.userId}`, 30, 60_000)) {
        throw new AppError('RATE_LIMITED', 429, 'Too many word filter changes, try again later');
      }
      return reply.send(ok(await wordFilterService.setBannedWords(parsed.data.words)));
    },
  );
}

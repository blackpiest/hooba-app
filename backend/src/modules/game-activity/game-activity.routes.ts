import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { ok } from '../../core/http/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { loadGameCatalog } from './load-catalog.js';

export async function registerGameActivityRoutes(app: FastifyInstance): Promise<void> {
  try {
    await loadGameCatalog();
  } catch (err: unknown) {
    app.log.error({ err }, 'game catalog');
  }

  app.get(
    '/api/v1/game-activity/catalog',
    { preHandler: requireAuth },
    async (request, reply) => {
      if (request.auth?.userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const games = await loadGameCatalog();
      return reply.send(ok({ schema_version: 1, games }));
    },
  );
}

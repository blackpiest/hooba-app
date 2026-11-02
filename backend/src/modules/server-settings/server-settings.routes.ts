import type { FastifyInstance } from 'fastify';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { requireOwner } from '../auth/auth.middleware.js';
import { patchServerSettingsBodySchema } from './server-settings.schemas.js';
import * as serverSettingsService from './server-settings.service.js';

export async function registerServerSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/server-settings',
    { preHandler: requireOwner },
    async (_request, reply) => {
      return reply.send(ok(await serverSettingsService.getServerSettings()));
    },
  );

  app.patch(
    '/api/v1/server-settings',
    { preHandler: requireOwner },
    async (request, reply) => {
      const parsed = patchServerSettingsBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new AppError('VALIDATION_ERROR', 400, first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body');
      }
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      if (!consumeRateLimit(`server-settings:edit:${userId}`, 20, 60_000)) {
        throw new AppError('RATE_LIMITED', 429, 'Too many changes, try again later');
      }
      let result = await serverSettingsService.getServerSettings();
      if (parsed.data.user_invites_enabled !== undefined) {
        result = await serverSettingsService.setUserInvitesEnabled(parsed.data.user_invites_enabled, userId);
      }
      if (parsed.data.timezone !== undefined && parsed.data.timezone !== result.timezone) {
        result = await serverSettingsService.setTimezone(parsed.data.timezone);
      }
      return reply.send(ok(result));
    },
  );
}

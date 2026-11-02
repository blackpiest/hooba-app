import type { FastifyInstance } from 'fastify';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { requireStaff } from '../auth/auth.middleware.js';
import { moderationLogsQuerySchema, moderationUserBodySchema } from './moderation.schemas.js';
import * as moderationService from './moderation.service.js';

export async function registerModerationRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/moderation/ban',
    { preHandler: requireStaff },
    async (request, reply) => {
      const actorId = request.auth?.userId;
      if (actorId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = moderationUserBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      const reason = parsed.data.reason?.trim() || null;
      await moderationService.banUser(actorId, parsed.data.user_id, reason);
      return reply.send(ok({ ok: true }));
    },
  );

  app.post(
    '/api/v1/moderation/kick',
    { preHandler: requireStaff },
    async (request, reply) => {
      const actorId = request.auth?.userId;
      if (actorId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = moderationUserBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      const reason = parsed.data.reason?.trim() || null;
      await moderationService.kickUser(actorId, parsed.data.user_id, reason);
      return reply.send(ok({ ok: true }));
    },
  );

  app.post(
    '/api/v1/moderation/warn',
    { preHandler: requireStaff },
    async (request, reply) => {
      const actorId = request.auth?.userId;
      if (actorId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = moderationUserBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      const reason = parsed.data.reason?.trim() || null;
      await moderationService.warnUser(actorId, parsed.data.user_id, reason);
      return reply.send(ok({ ok: true }));
    },
  );

  for (const [path, locked] of [
    ['/api/v1/moderation/display-name/hide', true],
    ['/api/v1/moderation/display-name/unhide', false],
  ] as const) {
    app.post(path, { preHandler: requireStaff }, async (request, reply) => {
      const actorId = request.auth?.userId;
      if (actorId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = moderationUserBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      const reason = parsed.data.reason?.trim() || null;
      await moderationService.setDisplayNameLock(actorId, parsed.data.user_id, locked, reason);
      return reply.send(ok({ ok: true }));
    });
  }

  app.get(
    '/api/v1/moderation/logs',
    { preHandler: requireStaff },
    async (request, reply) => {
      if (request.auth?.userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = moderationLogsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'query')}: ${first.message}` : 'Invalid query';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      const data = await moderationService.listLogs(parsed.data.offset, parsed.data.limit);
      return reply.send(ok(data));
    },
  );
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { parseIdParam } from '../../core/http/params.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { requireAuth, requireOwner } from '../auth/auth.middleware.js';
import * as invitesService from './invites.service.js';
import { createInviteBodySchema } from './invites.schemas.js';

export async function registerInvitesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/invites',
    { preHandler: requireOwner },
    async (_request, reply) => {
      const data = await invitesService.listInvitesForStaff();
      return reply.send(ok(data));
    },
  );

  app.get(
    '/api/v1/me/invites',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      if (!consumeRateLimit(`my-invites:${userId}`, 30, 60_000)) {
        throw new AppError('RATE_LIMITED', 429, 'Too many requests');
      }
      return reply.send(ok(await invitesService.listMyInvites(userId)));
    },
  );

  app.get('/api/v1/invites/:code', async (request, reply) => {
    if (!consumeRateLimit(`invite-preview:${request.ip}`, 30, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many requests');
    }
    const code = z.string().min(1).parse((request.params as { code: string }).code);
    const data = await invitesService.previewInviteByCode(code);
    return reply.send(ok(data));
  });

  app.post(
    '/api/v1/invites',
    { preHandler: requireOwner },
    async (request, reply) => {
      const parsed = createInviteBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      let expiresAt: Date | null = null;
      const raw = parsed.data.expires_at;
      if (raw && raw !== '') {
        expiresAt = new Date(raw);
        if (Number.isNaN(expiresAt.getTime())) {
          throw new AppError('VALIDATION_ERROR', 400, 'Invalid expires_at');
        }
      }
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      if (!consumeRateLimit(`invite-create:${userId}`, 10, 60_000)) {
        throw new AppError('RATE_LIMITED', 429, 'Too many requests');
      }
      const data = await invitesService.createInvite(userId, expiresAt);
      return reply.send(ok(data));
    },
  );

  app.delete(
    '/api/v1/invites/:id',
    { preHandler: requireOwner },
    async (request, reply) => {
      const id = parseIdParam(request.params, 'invite');
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      await invitesService.revokeInvite(id, userId);
      return reply.send(ok({ ok: true }));
    },
  );
}

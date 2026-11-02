import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { parseIdParam } from '../../core/http/params.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { ok } from '../../core/http/response.js';
import { requireAuth, requireOwner } from '../auth/auth.middleware.js';
import { announcementBodySchema, type AnnouncementInput } from './announcements.schemas.js';
import * as announcementsService from './announcements.service.js';

function parseBody(body: unknown): AnnouncementInput {
  const parsed = announcementBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') || 'body';
    throw new AppError('VALIDATION_ERROR', 400, first ? `${path}: ${first.message}` : 'Invalid body');
  }
  return parsed.data;
}

function authedUserId(request: FastifyRequest): number {
  const userId = request.auth?.userId;
  if (userId === undefined) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
  }
  return userId;
}

function limitEdits(actorId: number): void {
  if (!consumeRateLimit(`announcements:edit:${actorId}`, 30, 60_000)) {
    throw new AppError('RATE_LIMITED', 429, 'Too many changes, try again later');
  }
}

export async function registerAnnouncementsRoutes(app: FastifyInstance): Promise<void> {
  /** Участник: непрочитанные объявления, дата которых наступила. Клиент спрашивает при входе и по `announcement:new`. */
  app.get('/api/v1/announcements/pending', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authedUserId(request);
    if (!consumeRateLimit(`announcements:pending:${userId}`, 30, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many requests');
    }
    return reply.send(ok(await announcementsService.listMyPending(userId)));
  });

  app.post('/api/v1/announcements/:id/seen', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authedUserId(request);
    const id = parseIdParam(request.params, 'announcement');
    await announcementsService.markSeen(userId, id);
    return reply.send(ok({ ok: true }));
  });

  app.get('/api/v1/announcements', { preHandler: requireOwner }, async (_request, reply) => {
    return reply.send(ok(await announcementsService.listAnnouncements()));
  });

  app.post('/api/v1/announcements', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const body = parseBody(request.body);
    limitEdits(actorId);
    return reply.send(ok(await announcementsService.createAnnouncement(actorId, body)));
  });

  app.patch('/api/v1/announcements/:id', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const id = parseIdParam(request.params, 'announcement');
    const body = parseBody(request.body);
    limitEdits(actorId);
    return reply.send(ok(await announcementsService.updateAnnouncement(id, body)));
  });

  app.delete('/api/v1/announcements/:id', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const id = parseIdParam(request.params, 'announcement');
    limitEdits(actorId);
    await announcementsService.deleteAnnouncement(actorId, id);
    return reply.send(ok({ ok: true }));
  });
}

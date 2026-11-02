import type { FastifyInstance } from 'fastify';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { parseIdParam } from '../../core/http/params.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { requireAuth, requireStaff } from '../auth/auth.middleware.js';
import { broadcastChannelEvent } from '../realtime/ws-registry.js';
import { patchMessageBodySchema } from './messages.schemas.js';
import * as messagesService from './messages.service.js';
import { setReaction } from './reactions.service.js';

export async function registerMessagesRoutes(app: FastifyInstance): Promise<void> {
  app.patch(
    '/api/v1/messages/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = parseIdParam(request.params, 'message');
      const parsed = patchMessageBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      const data = await messagesService.updateMessageBody(id, userId, parsed.data.content);
      await broadcastChannelEvent(data.channel_id, 'message:edited', { message: data });
      return reply.send(ok(data));
    },
  );

  app.delete(
    '/api/v1/messages/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = parseIdParam(request.params, 'message');
      const removed = await messagesService.softDeleteMessage(id, userId);
      await broadcastChannelEvent(removed.channel_id, 'message:deleted', {
        message_id: removed.id,
        channel_id: removed.channel_id,
      });
      if (removed.unpinned) {
        await broadcastChannelEvent(removed.channel_id, 'channel:pin', messagesService.emptyPinDto(removed.channel_id));
      }
      return reply.send(ok({ ok: true }));
    },
  );

  app.get(
    '/api/v1/channels/:id/pin',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = parseIdParam(request.params, 'channel');
      return reply.send(ok(await messagesService.getChannelPin(id, userId)));
    },
  );

  app.put(
    '/api/v1/messages/:id/pin',
    { preHandler: requireStaff },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = parseIdParam(request.params, 'message');
      if (!consumeRateLimit(`messages:pin:${userId}`, 20, 60_000)) {
        throw new AppError('RATE_LIMITED', 429, 'Too many pin changes');
      }
      const data = await messagesService.pinMessage(id, userId);
      await broadcastChannelEvent(data.channel_id, 'channel:pin', data);
      return reply.send(ok(data));
    },
  );

  app.delete(
    '/api/v1/channels/:id/pin',
    { preHandler: requireStaff },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = parseIdParam(request.params, 'channel');
      if (!consumeRateLimit(`messages:pin:${userId}`, 20, 60_000)) {
        throw new AppError('RATE_LIMITED', 429, 'Too many pin changes');
      }
      const data = await messagesService.unpinChannel(id, userId);
      await broadcastChannelEvent(id, 'channel:pin', data);
      return reply.send(ok(data));
    },
  );

  // Реакция: :emoji — URL-кодированный unicode-эмодзи или `c:<id>` кастомного смайлика.
  for (const [method, on] of [['PUT', true], ['DELETE', false]] as const) {
    app.route<{ Params: { id: string; emoji: string } }>({
      method,
      url: '/api/v1/messages/:id/reactions/:emoji',
      preHandler: requireAuth,
      handler: async (request, reply) => {
        const userId = request.auth?.userId;
        if (userId === undefined) {
          throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
        }
        const id = parseIdParam(request.params, 'message');
        if (!consumeRateLimit(`messages:react:${userId}`, 30, 10_000)) {
          throw new AppError('RATE_LIMITED', 429, 'Too many reactions, slow down');
        }
        const data = await setReaction(id, userId, request.params.emoji, on);
        await broadcastChannelEvent(data.channel_id, 'message:reactions', data);
        return reply.send(ok(data));
      },
    });
  }
}

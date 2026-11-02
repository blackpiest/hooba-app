import type { FastifyInstance } from 'fastify';
import { ChannelType } from '@prisma/client';
import { ok, fail } from '../../core/http/response.js';
import * as messagesService from '../messages/messages.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { parseIdParam } from '../../core/http/params.js';
import { requireAuth, requireStaff, userIsStaff } from '../auth/auth.middleware.js';
import {
  channelMessagesQuerySchema,
  createChannelBodySchema,
  patchChannelBodySchema,
  reorderChannelsBodySchema,
} from './channels.schemas.js';
import * as channelsService from './channels.service.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';

export async function registerChannelsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/channels/dm', async (_request, reply) => {
    return reply.status(501).send(fail('NOT_IMPLEMENTED', 'DM channels are not available in this version'));
  });

  app.get(
    '/api/v1/channels',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const data = await channelsService.listChannels(userId);
      return reply.send(ok(data));
    },
  );

  app.post(
    '/api/v1/channels',
    { preHandler: requireStaff },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = createChannelBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      const type = parsed.data.channel_type as ChannelType;
      const data = await channelsService.createChannel(
        userId,
        parsed.data.name,
        type,
        parsed.data.is_private,
        parsed.data.member_user_ids,
        {
          view: parsed.data.view_role_ids,
          send: parsed.data.send_role_ids,
          speak: parsed.data.speak_role_ids,
          stream: parsed.data.stream_role_ids,
          attach: parsed.data.attach_role_ids,
          react: parsed.data.react_role_ids,
          reactUsers: parsed.data.react_user_ids,
        },
      );
      publishRealtimeEvent('channel:list_changed', { reason: 'created', channel_id: data.id });
      return reply.status(201).send(ok(data));
    },
  );

  app.patch(
    '/api/v1/channels/order',
    { preHandler: requireStaff },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = reorderChannelsBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      await channelsService.reorderChannels(userId, parsed.data.channel_type, parsed.data.channel_ids);
      publishRealtimeEvent('channel:list_changed', { reason: 'reordered' });
      return reply.send(ok({ ok: true }));
    },
  );

  app.get(
    '/api/v1/channels/:id/messages',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = parseIdParam(request.params, 'channel');
      const parsed = channelMessagesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'query')}: ${first.message}` : 'Invalid query';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      const before =
        parsed.data.before_created_at !== undefined && parsed.data.before_id !== undefined
          ? { createdAt: new Date(parsed.data.before_created_at), id: parsed.data.before_id }
          : undefined;
      const data = await messagesService.listMessages(id, userId, {
        offset: parsed.data.offset,
        limit: parsed.data.limit,
        before,
      });
      return reply.send(ok(data));
    },
  );

  app.get(
    '/api/v1/channels/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = parseIdParam(request.params, 'channel');
      const data = await channelsService.getChannelById(id, userId, await userIsStaff(userId));
      return reply.send(ok(data));
    },
  );

  app.patch(
    '/api/v1/channels/:id',
    { preHandler: requireStaff },
    async (request, reply) => {
      const id = parseIdParam(request.params, 'channel');
      const parsed = patchChannelBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
        throw new AppError('VALIDATION_ERROR', 400, msg);
      }
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const data = await channelsService.updateChannel(id, userId, {
        name: parsed.data.name,
        isPrivate: parsed.data.is_private,
        memberUserIds: parsed.data.member_user_ids,
        rules: {
          view: parsed.data.view_role_ids,
          send: parsed.data.send_role_ids,
          speak: parsed.data.speak_role_ids,
          stream: parsed.data.stream_role_ids,
          attach: parsed.data.attach_role_ids,
          react: parsed.data.react_role_ids,
          reactUsers: parsed.data.react_user_ids,
        },
      });
      publishRealtimeEvent('channel:list_changed', { reason: 'updated', channel_id: data.id });
      return reply.send(ok(data));
    },
  );

  app.delete(
    '/api/v1/channels/:id',
    { preHandler: requireStaff },
    async (request, reply) => {
      const id = parseIdParam(request.params, 'channel');
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      await channelsService.softDeleteChannel(id, userId);
      publishRealtimeEvent('channel:list_changed', { reason: 'deleted', channel_id: id });
      return reply.send(ok({ ok: true }));
    },
  );

  app.post(
    '/api/v1/channels/:id/join',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = parseIdParam(request.params, 'channel');
      await channelsService.joinChannel(id, userId);
      return reply.send(ok({ ok: true }));
    },
  );

  app.post(
    '/api/v1/channels/:id/leave',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = parseIdParam(request.params, 'channel');
      await channelsService.leaveChannel(id, userId);
      return reply.send(ok({ ok: true }));
    },
  );
}

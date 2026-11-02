import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { requireAuth } from '../auth/auth.middleware.js';
import * as usersService from './users.service.js';

const presenceBodySchema = z.object({
  status: z.enum(['online', 'idle', 'dnd', 'invisible']),
});

const avatarBodySchema = z.object({
  avatar: z
    .object({
      character: z.string().min(1).max(32).nullable(),
      background: z.string().min(1).max(32).nullable(),
      frame: z.string().min(1).max(32).nullable(),
    })
    .nullable(),
});

const profileBodySchema = z.object({
  display_name: z.string().max(200).nullable(),
});

export async function registerUsersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/users',
    { preHandler: requireAuth },
    async (request, reply) => {
      if (request.auth?.userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const data = await usersService.listUsersForDirectory();
      return reply.send(ok(data));
    },
  );

  app.patch(
    '/api/v1/me/presence',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = presenceBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 400, 'status: invalid');
      }
      const data = await usersService.setMyPresence(userId, parsed.data.status);
      return reply.send(ok(data));
    },
  );

  app.patch(
    '/api/v1/me/avatar',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = avatarBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 400, 'avatar: invalid');
      }
      if (!consumeRateLimit(`me-avatar:${userId}`, 20, 60_000)) {
        throw new AppError('RATE_LIMITED', 429, 'Too many requests');
      }
      const data = await usersService.setMyAvatar(userId, parsed.data.avatar);
      return reply.send(ok(data));
    },
  );

  app.patch(
    '/api/v1/me/profile',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const parsed = profileBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 400, 'display_name: invalid');
      }
      if (!consumeRateLimit(`me-profile:${userId}`, 10, 60_000)) {
        throw new AppError('RATE_LIMITED', 429, 'Too many requests');
      }
      const data = await usersService.setMyDisplayName(userId, parsed.data.display_name);
      return reply.send(ok(data));
    },
  );
}

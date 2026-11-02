import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { ok } from '../../core/http/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import * as profileNewsService from './profile-news.service.js';

function authedUserId(request: FastifyRequest): number {
  const userId = request.auth?.userId;
  if (userId === undefined) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
  }
  return userId;
}

export async function registerProfileNewsRoutes(app: FastifyInstance): Promise<void> {
  /** Новинки конструктора профиля: клиент показывает подсказку у кнопки профиля. */
  app.get('/api/v1/me/profile-news', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authedUserId(request);
    if (!consumeRateLimit(`me-profile-news:${userId}`, 60, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many requests');
    }
    return reply.send(ok(await profileNewsService.getProfileNews(userId)));
  });

  /** Открыл конструктор или отмахнулся от подсказки: всё текущее — просмотрено. */
  app.post('/api/v1/me/profile-news/seen', { preHandler: requireAuth }, async (request, reply) => {
    await profileNewsService.markProfileNewsSeen(authedUserId(request));
    return reply.send(ok({ ok: true }));
  });
}

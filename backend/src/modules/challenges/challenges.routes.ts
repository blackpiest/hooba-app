import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { parseIdParam } from '../../core/http/params.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { ok } from '../../core/http/response.js';
import { requireAuth, requireOwner } from '../auth/auth.middleware.js';
import { createChallengeBodySchema, patchChallengeBodySchema } from './challenge-schema.js';
import * as challengesService from './challenges.service.js';

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body ?? {});
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
  if (!consumeRateLimit(`challenges:edit:${actorId}`, 60, 60_000)) {
    throw new AppError('RATE_LIMITED', 429, 'Too many changes, try again later');
  }
}

export async function registerChallengesRoutes(app: FastifyInstance): Promise<void> {
  /** Участник: активные испытания с прогрессом и выполненные архивные. Прогресс считается запросами — лимит мягкий. */
  app.get('/api/v1/me/challenges', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authedUserId(request);
    if (!consumeRateLimit(`me-challenges:${userId}`, 30, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many requests');
    }
    return reply.send(ok(await challengesService.myChallenges(userId)));
  });

  app.get('/api/v1/challenges', { preHandler: requireOwner }, async (_request, reply) => {
    return reply.send(ok(await challengesService.listChallenges()));
  });

  app.post('/api/v1/challenges', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const body = parseBody(createChallengeBodySchema, request.body);
    limitEdits(actorId);
    return reply.send(ok(await challengesService.createChallenge(actorId, body)));
  });

  app.patch('/api/v1/challenges/:id', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const id = parseIdParam(request.params, 'challenge');
    const body = parseBody(patchChallengeBodySchema, request.body);
    limitEdits(actorId);
    return reply.send(ok(await challengesService.updateChallenge(id, body)));
  });

  app.delete('/api/v1/challenges/:id', { preHandler: requireOwner }, async (request, reply) => {
    limitEdits(authedUserId(request));
    await challengesService.deleteChallenge(parseIdParam(request.params, 'challenge'));
    return reply.send(ok({ deleted: true }));
  });

  app.post('/api/v1/challenges/:id/publish', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    limitEdits(actorId);
    return reply.send(ok(await challengesService.publishChallenge(actorId, parseIdParam(request.params, 'challenge'))));
  });

  app.post('/api/v1/challenges/:id/archive', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    limitEdits(actorId);
    return reply.send(ok(await challengesService.archiveChallenge(actorId, parseIdParam(request.params, 'challenge'))));
  });

  app.get('/api/v1/challenges/:id/progress', { preHandler: requireOwner }, async (request, reply) => {
    return reply.send(ok(await challengesService.challengeStandings(parseIdParam(request.params, 'challenge'))));
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { parseIdParam } from '../../core/http/params.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { ok } from '../../core/http/response.js';
import { requireAuth, requireOwner } from '../auth/auth.middleware.js';
import { COSMETIC_KINDS, type CosmeticKind } from '../cosmetics/cosmetic-access.js';
import { markChallengeDirty } from '../challenges/challenge-evaluator.js';
import { markCosmeticSeen } from '../profile-news/profile-news.service.js';
import * as badgesService from './badges.service.js';

const cosmeticIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/);

const showcaseBodySchema = z.object({
  pinned_badges: z.array(cosmeticIdSchema).max(badgesService.PINNED_BADGES_MAX),
  title: cosmeticIdSchema.nullable(),
});

const badgeBodySchema = z.object({ badge_id: cosmeticIdSchema });
const titleBodySchema = z.object({ title_id: cosmeticIdSchema });
const kindSchema = z.enum(COSMETIC_KINDS as [CosmeticKind, ...CosmeticKind[]]);
const cosmeticBodySchema = z.object({ kind: kindSchema, id: cosmeticIdSchema });

function authedUserId(request: { auth?: { userId: number } }): number {
  const userId = request.auth?.userId;
  if (userId === undefined) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
  }
  return userId;
}

function cosmeticParam(params: unknown, key: string): string {
  const raw = params && typeof params === 'object' ? (params as Record<string, unknown>)[key] : undefined;
  const parsed = cosmeticIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 400, `Invalid ${key}`);
  }
  return parsed.data;
}

/** Выдача и отзыв — частые клики в диалоге владельца, лимит мягкий. */
function consumeGrantLimit(actorId: number): void {
  if (!consumeRateLimit(`cosmetic-grant:${actorId}`, 60, 60_000)) {
    throw new AppError('RATE_LIMITED', 429, 'Too many requests');
  }
}

export async function registerBadgesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/me/cosmetics', { preHandler: requireAuth }, async (request, reply) => {
    return reply.send(ok(await badgesService.getCosmetics(authedUserId(request))));
  });

  /** Нажал на предмет в конструкторе: снять метку «Новое». */
  app.post('/api/v1/me/cosmetics/seen', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authedUserId(request);
    const parsed = cosmeticBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'cosmetic: invalid');
    }
    if (!consumeRateLimit(`me-cosmetics-seen:${userId}`, 60, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many requests');
    }
    await markCosmeticSeen(userId, parsed.data.kind, parsed.data.id);
    return reply.send(ok({ ok: true }));
  });

  app.patch('/api/v1/me/showcase', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authedUserId(request);
    const parsed = showcaseBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'showcase: invalid');
    }
    if (!consumeRateLimit(`me-showcase:${userId}`, 20, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many requests');
    }
    return reply.send(ok(await badgesService.setMyShowcase(userId, parsed.data)));
  });

  app.get('/api/v1/users/:id/cosmetics', { preHandler: requireOwner }, async (request, reply) => {
    return reply.send(ok(await badgesService.getCosmetics(parseIdParam(request.params, 'user'))));
  });

  app.post('/api/v1/users/:id/badges', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const targetId = parseIdParam(request.params, 'user');
    const parsed = badgeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'badge_id: invalid');
    }
    consumeGrantLimit(actorId);
    return reply.send(ok(await badgesService.grantBadge(actorId, targetId, parsed.data.badge_id)));
  });

  app.delete('/api/v1/users/:id/badges/:badgeId', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const targetId = parseIdParam(request.params, 'user');
    consumeGrantLimit(actorId);
    return reply.send(ok(await badgesService.revokeBadge(actorId, targetId, cosmeticParam(request.params, 'badgeId'))));
  });

  /** Любой вид косметики (закрытую рамку можно подарить). Выдача может открыть цепочку испытаний. */
  app.post('/api/v1/users/:id/cosmetics', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const targetId = parseIdParam(request.params, 'user');
    const parsed = cosmeticBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'cosmetic: invalid');
    }
    consumeGrantLimit(actorId);
    const result = await badgesService.grantCosmetic(actorId, targetId, parsed.data.kind, parsed.data.id);
    markChallengeDirty([targetId]);
    return reply.send(ok(result));
  });

  app.delete('/api/v1/users/:id/cosmetics/:kind/:itemId', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const targetId = parseIdParam(request.params, 'user');
    const kind = kindSchema.safeParse((request.params as Record<string, unknown>).kind);
    if (!kind.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid kind');
    }
    consumeGrantLimit(actorId);
    return reply.send(ok(await badgesService.revokeCosmetic(actorId, targetId, kind.data, cosmeticParam(request.params, 'itemId'))));
  });

  app.post('/api/v1/users/:id/titles', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const targetId = parseIdParam(request.params, 'user');
    const parsed = titleBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'title_id: invalid');
    }
    consumeGrantLimit(actorId);
    return reply.send(ok(await badgesService.grantTitle(actorId, targetId, parsed.data.title_id)));
  });

  app.delete('/api/v1/users/:id/titles/:titleId', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = authedUserId(request);
    const targetId = parseIdParam(request.params, 'user');
    consumeGrantLimit(actorId);
    return reply.send(ok(await badgesService.revokeTitle(actorId, targetId, cosmeticParam(request.params, 'titleId'))));
  });
}

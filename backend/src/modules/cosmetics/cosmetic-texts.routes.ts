import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { ok } from '../../core/http/response.js';
import { requireOwner } from '../auth/auth.middleware.js';
import { COSMETIC_KINDS } from './cosmetic-access.js';
import * as textsService from './cosmetic-texts.service.js';

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/);
const kindSchema = z.enum(['badge', 'title']);

/** Те же пределы, что у каталога (`avatar-catalog.ts`): правка не может стать тем, что каталог бы не принял. */
const badgeTextsSchema = z.object({
  name: z.string().trim().min(1).max(32),
  description: z.string().trim().min(1).max(160),
  category: z.enum(['role', 'achievement', 'event', 'reward']),
  hint: z.string().trim().max(120).nullable(),
});
const titleLabelSchema = z.string().trim().min(1).max(32);
/** `badge` не передан — значок не меняется (старые клиенты шлют только подпись). */
const titleTextsSchema = z.object({ label: titleLabelSchema, badge: idSchema.nullable().optional() });
const newTitleSchema = z.object({ label: titleLabelSchema, badge: idSchema.nullable() });
const listedSchema = z.object({ listed: z.boolean() });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AppError('VALIDATION_ERROR', 400, first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid body');
  }
  return parsed.data;
}

function actor(request: FastifyRequest): number {
  const userId = request.auth?.userId;
  if (userId === undefined) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
  }
  if (!consumeRateLimit(`cosmetic-texts:${userId}`, 60, 60_000)) {
    throw new AppError('RATE_LIMITED', 429, 'Too many changes, try again later');
  }
  return userId;
}

function param(request: FastifyRequest, key: string): string {
  const value = (request.params as Record<string, unknown>)[key];
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 400, `Invalid ${key}`);
  }
  return parsed.data;
}

/**
 * Витрина косметики (только владелец): правка текстов значков и титулов поверх каталога, свои титулы,
 * скрытие каталожных, витрина/запас любого вида.
 */
export async function registerCosmeticTextsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/cosmetics/texts', { preHandler: requireOwner }, async (_request, reply) => {
    return reply.send(ok(await textsService.listCosmeticTexts()));
  });

  app.put('/api/v1/cosmetics/texts/badge/:id', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = actor(request);
    const body = parse(badgeTextsSchema, request.body);
    return reply.send(ok(await textsService.setBadgeTexts(actorId, param(request, 'id'), body)));
  });

  app.put('/api/v1/cosmetics/texts/title/:id', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = actor(request);
    const body = parse(titleTextsSchema, request.body);
    return reply.send(ok(await textsService.setTitleTexts(actorId, param(request, 'id'), body)));
  });

  app.post('/api/v1/cosmetics/titles', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = actor(request);
    const body = parse(newTitleSchema, request.body);
    return reply.send(ok(await textsService.createTitle(actorId, body)));
  });

  app.delete('/api/v1/cosmetics/titles/:id', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = actor(request);
    return reply.send(ok(await textsService.deleteTitle(actorId, param(request, 'id'))));
  });

  app.post('/api/v1/cosmetics/titles/:id/restore', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = actor(request);
    return reply.send(ok(await textsService.restoreTitle(actorId, param(request, 'id'))));
  });

  app.put('/api/v1/cosmetics/listed/:kind/:id', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = actor(request);
    const kind = z.enum(COSMETIC_KINDS).safeParse((request.params as Record<string, unknown>).kind);
    if (!kind.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid kind');
    }
    const body = parse(listedSchema, request.body);
    return reply.send(ok(await textsService.setListed(actorId, kind.data, param(request, 'id'), body.listed)));
  });

  app.delete('/api/v1/cosmetics/texts/:kind/:id', { preHandler: requireOwner }, async (request, reply) => {
    const actorId = actor(request);
    const kind = kindSchema.safeParse((request.params as Record<string, unknown>).kind);
    if (!kind.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid kind');
    }
    return reply.send(ok(await textsService.resetTexts(actorId, kind.data, param(request, 'id'))));
  });
}

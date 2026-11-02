import type { FastifyInstance } from 'fastify';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { parseIdParam } from '../../core/http/params.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { requireAuth, requireOwner } from '../auth/auth.middleware.js';
import { readSingleFile } from '../attachments/attachments.routes.js';
import { admitUpload, MAX_EMOJI_UPLOAD_BYTES } from '../attachments/image-pipeline.js';
import { readEmojiFile } from './emoji-storage.js';
import { createEmojiQuerySchema, patchEmojiBodySchema } from './emojis.schemas.js';
import * as emojisService from './emojis.service.js';

const EMOJI_FILE_RE = /^([1-9]\d{0,9})\.webp$/;

function validationMessage(issues: { path: PropertyKey[]; message: string }[], fallback: string): string {
  const first = issues[0];
  return first ? `${String(first.path[0] ?? fallback)}: ${first.message}` : `Invalid ${fallback}`;
}

/** Регистрировать после attachments: там подключается multipart. */
export async function registerEmojisRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/emojis', { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(ok(await emojisService.listEmojis()));
  });

  // Без токена, как файлы аватаров: <img> не шлёт Authorization. Ссылка версионирована (?v=), файл неизменен.
  app.get<{ Params: { file: string } }>('/api/v1/emojis/:file', async (request, reply) => {
    const match = EMOJI_FILE_RE.exec(request.params.file);
    const body = match ? await readEmojiFile(Number(match[1])) : null;
    if (!body) {
      throw new AppError('NOT_FOUND', 404, 'Emoji not found');
    }
    return reply
      .header('Content-Type', 'image/webp')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(body);
  });

  // Имя — в query: multipart принимает только один файл без текстовых полей.
  app.post('/api/v1/emojis', { preHandler: requireOwner }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (userId === undefined) {
      throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
    }
    const parsed = createEmojiQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, validationMessage(parsed.error.issues, 'query'));
    }
    if (!consumeRateLimit(`emojis:upload:${userId}`, 20, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many uploads, try again later');
    }
    const done = admitUpload();
    try {
      const file = await readSingleFile(request, {
        maxBytes: MAX_EMOJI_UPLOAD_BYTES,
        message: 'Emoji image must be at most 256 KB',
      });
      return reply.status(201).send(ok(await emojisService.createEmoji(userId, parsed.data.name, file.buffer)));
    } finally {
      done();
    }
  });

  app.patch('/api/v1/emojis/:id', { preHandler: requireOwner }, async (request, reply) => {
    const id = parseIdParam(request.params, 'emoji');
    const parsed = patchEmojiBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, validationMessage(parsed.error.issues, 'body'));
    }
    if (!consumeRateLimit(`emojis:edit:${request.auth?.userId}`, 30, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many emoji changes, try again later');
    }
    return reply.send(ok(await emojisService.renameEmoji(id, parsed.data.name)));
  });

  app.delete('/api/v1/emojis/:id', { preHandler: requireOwner }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (userId === undefined) {
      throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
    }
    const id = parseIdParam(request.params, 'emoji');
    if (!consumeRateLimit(`emojis:edit:${userId}`, 30, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many emoji changes, try again later');
    }
    await emojisService.deleteEmoji(userId, id);
    return reply.send(ok({ ok: true }));
  });
}

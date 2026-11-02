import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { parseIdParam } from '../../core/http/params.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { admitUpload, MAX_UPLOAD_BYTES } from './image-pipeline.js';
import {
  ATTACHMENT_VARIANTS,
  configureAttachmentStorage,
  isAttachmentId,
  storageConfig,
  variantPath,
  verifyAttachmentSignature,
  type AttachmentVariant,
} from './attachment-storage.js';
import * as attachmentsService from './attachments.service.js';

/** Один файл из multipart. `maxBytes` — свой лимит вместо общего (например, для смайликов). */
export async function readSingleFile(
  request: FastifyRequest,
  limit: { maxBytes: number; message: string } = { maxBytes: MAX_UPLOAD_BYTES, message: 'Image must be at most 10 MB' },
): Promise<{ buffer: Buffer; filename: string }> {
  let part;
  try {
    part = await request.file({ limits: { fileSize: limit.maxBytes, files: 1, fields: 0, parts: 1, headerPairs: 50 } });
  } catch {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 415, 'Expected multipart/form-data with one file');
  }
  if (!part) {
    throw new AppError('VALIDATION_ERROR', 400, 'File is required');
  }
  try {
    return { buffer: await part.toBuffer(), filename: part.filename };
  } catch (error) {
    if ((error as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new AppError('FILE_TOO_LARGE', 413, limit.message);
    }
    throw error;
  }
}

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function registerAttachmentsRoutes(app: FastifyInstance): Promise<void> {
  configureAttachmentStorage(app.appEnv);

  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1, headerPairs: 50 },
  });

  app.post(
    '/api/v1/channels/:id/attachments',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const channelId = parseIdParam(request.params, 'channel');
      if (!consumeRateLimit(`attachments:upload:${userId}`, 12, 60_000)) {
        throw new AppError('RATE_LIMITED', 429, 'Too many uploads, try again later');
      }
      // Место в очереди — до чтения файла в память.
      const done = admitUpload();
      try {
        const file = await readSingleFile(request);
        const data = await attachmentsService.uploadAttachment(userId, channelId, file);
        return reply.status(201).send(ok(data));
      } finally {
        done();
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/v1/attachments/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const id = request.params.id;
      if (!isAttachmentId(id)) {
        throw new AppError('NOT_FOUND', 404, 'Attachment not found');
      }
      await attachmentsService.discardPendingAttachment(userId, id);
      return reply.send(ok({ ok: true }));
    },
  );

  /**
   * Отдача файла по подписанной ссылке (без Bearer: `<img>` его не шлёт). Подпись выдаётся только вместе
   * с сообщениями, то есть тем, кто видит канал.
   */
  app.get<{ Params: { id: string; variant: string }; Querystring: { exp?: string; sig?: string } }>(
    '/api/v1/attachments/:id/:variant',
    async (request, reply) => {
      const { id, variant } = request.params;
      if (!isAttachmentId(id) || !ATTACHMENT_VARIANTS.includes(variant as AttachmentVariant)) {
        throw new AppError('NOT_FOUND', 404, 'Attachment not found');
      }
      const left = verifyAttachmentSignature(
        id,
        variant as AttachmentVariant,
        Number(request.query.exp),
        String(request.query.sig ?? ''),
      );
      if (left === null) {
        throw new AppError('LINK_EXPIRED', 403, 'Attachment link is invalid or expired');
      }
      const row = await attachmentsService.findServableAttachment(id);
      if (!row) {
        throw new AppError('NOT_FOUND', 404, 'Attachment not found');
      }
      reply
        .header('Cache-Control', `private, max-age=${Math.min(left, 86_400)}, immutable`)
        .header('Content-Disposition', contentDisposition(row.originalName))
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Security-Policy', "default-src 'none'; sandbox")
        .header('Cross-Origin-Resource-Policy', 'cross-origin');
      if (storageConfig().serveMode === 'x-accel') {
        // Файл отдаёт nginx (internal location /_uploads/), Node не держит поток.
        return reply.header('X-Accel-Redirect', `/_uploads/${id}/${variant}.webp`).send();
      }
      const file = variantPath(id, variant as AttachmentVariant);
      const info = await stat(file).catch(() => null);
      if (!info) {
        throw new AppError('NOT_FOUND', 404, 'Attachment not found');
      }
      return reply.type('image/webp').header('Content-Length', info.size).send(createReadStream(file));
    },
  );
}

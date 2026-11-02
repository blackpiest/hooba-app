import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { requireOwner } from '../auth/auth.middleware.js';
import { readSingleFile } from '../attachments/attachments.routes.js';
import { admitUpload, MAX_SERVER_ICON_UPLOAD_BYTES } from '../attachments/image-pipeline.js';
import { setupTokensMatch } from '../setup/setup-token.js';
import { getSetupStatus } from '../setup/setup.service.js';
import { readServerIconFile, verifyServerIconLink } from './server-icon-storage.js';
import * as serverIconService from './server-icon.service.js';

const FILE_LIMIT = { maxBytes: MAX_SERVER_ICON_UPLOAD_BYTES, message: 'Server icon must be at most 2 MB' };

/** Принять файл в очередь допуска, прочитать и сохранить. */
async function uploadIcon(request: FastifyRequest, actor: { actorId: number } | 'setup') {
  const done = admitUpload();
  try {
    const file = await readSingleFile(request, FILE_LIMIT);
    return await serverIconService.setServerIcon(file.buffer, actor);
  } finally {
    done();
  }
}

/** Регистрировать после attachments: там подключается multipart и хранилище файлов. */
export async function registerServerIconRoutes(app: FastifyInstance): Promise<void> {
  // Без Authorization (<img> его не шлёт), но только по подписанной ссылке, которую получают вошедшие.
  app.get<{ Params: { file: string }; Querystring: { exp?: string; sig?: string } }>(
    '/api/v1/server/icon/:file',
    async (request, reply) => {
      const link = verifyServerIconLink(
        request.params.file,
        Number(request.query.exp),
        String(request.query.sig ?? ''),
      );
      if (!link) {
        throw new AppError('LINK_EXPIRED', 403, 'Server icon link is invalid or expired');
      }
      const body = await readServerIconFile(link.key);
      if (!body) {
        throw new AppError('NOT_FOUND', 404, 'Server icon not found');
      }
      return reply
        .header('Content-Type', 'image/webp')
        .header('Cache-Control', `private, max-age=${Math.min(link.left, 86_400)}, immutable`)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(body);
    },
  );

  app.put('/api/v1/server-settings/icon', { preHandler: requireOwner }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (userId === undefined) {
      throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
    }
    if (!consumeRateLimit(`server-settings:icon:${userId}`, 10, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many changes, try again later');
    }
    return reply.send(ok(await uploadIcon(request, { actorId: userId })));
  });

  app.delete('/api/v1/server-settings/icon', { preHandler: requireOwner }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (userId === undefined) {
      throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
    }
    if (!consumeRateLimit(`server-settings:icon:${userId}`, 10, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many changes, try again later');
    }
    return reply.send(ok(await serverIconService.removeServerIcon(userId)));
  });

  // Первичная настройка: владельца ещё нет, доступ — по setup-токену в заголовке (тело — только файл).
  app.put('/api/v1/setup/icon', async (request, reply) => {
    if (!consumeRateLimit(`setup:icon:${request.ip}`, 5, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many requests');
    }
    const header = request.headers['x-setup-token'];
    const token = typeof header === 'string' ? header : '';
    if (!token || !setupTokensMatch(app.appEnv.setupToken, token)) {
      throw new AppError('SETUP_FORBIDDEN', 401, 'Invalid setup token');
    }
    // Быстрый отказ до чтения файла; окончательная проверка — в транзакции сервиса.
    if ((await getSetupStatus()).isBootstrapped) {
      throw new AppError('SERVER_ALREADY_BOOTSTRAPPED', 409, 'Server is already bootstrapped');
    }
    return reply.send(ok(await uploadIcon(request, 'setup')));
  });
}

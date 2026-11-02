import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { ok } from '../../core/http/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import {
  avatarFilePath,
  isCatalogFile,
  loadAvatarCatalog,
  type AvatarBackground,
  type AvatarBadge,
  type AvatarCharacter,
  type AvatarFrame,
} from './avatar-catalog.js';
import { canUseCosmetic, itemKey, loadCosmeticAccess, type CosmeticAccess, type CosmeticKind } from '../cosmetics/cosmetic-access.js';

const FILES_PREFIX = '/api/v1/avatars/files/';

/**
 * Версия = mtime catalog.json: при замене картинки без смены имени файла
 * нужно сохранить и манифест, иначе клиенты останутся на кэше (immutable).
 */
function toPublicCharacter(item: AvatarCharacter, version: string) {
  return {
    id: item.id,
    name: item.name ?? item.id,
    listed: item.listed,
    url: `${FILES_PREFIX}${item.file}?v=${version}`,
    head_url: `${FILES_PREFIX}${item.head}?v=${version}`,
    idle: item.idle
      ? {
          url: `${FILES_PREFIX}${item.idle.file}?v=${version}`,
          frames: item.idle.frames,
          fps: item.idle.fps,
          sequence: item.idle.sequence ?? Array.from({ length: item.idle.frames }, (_, i) => i),
        }
      : null,
  };
}

/** Фон целиком: клиент рисует его по спеке. Файл слоя превращается в URL. */
function toPublicBackground(item: AvatarBackground, version: string) {
  return {
    id: item.id,
    label: item.label,
    listed: item.listed,
    base: item.base ?? null,
    layers: item.layers.map((layer) =>
      'file' in layer
        ? { url: `${FILES_PREFIX}${layer.file}?v=${version}`, size: layer.size, motion: layer.motion, blink: layer.blink }
        : {
            bitmap: layer.bitmap,
            color: layer.color,
            px: layer.px,
            offsets: layer.offsets,
            size: layer.size,
            motion: layer.motion,
            blink: layer.blink,
          },
    ),
  };
}

/**
 * Доступ к предмету для этого пользователя: `locked` — надеть нельзя (в конструкторе виден, если `listed`);
 * `challenge_ids` — испытания, которые его дают (у открытого — пустой).
 */
function lockOf(access: CosmeticAccess, kind: CosmeticKind, id: string) {
  const locked = !canUseCosmetic(access, kind, id);
  return { locked, challenge_ids: locked ? (access.locked.get(itemKey(kind, id)) ?? []) : [] };
}

function toPublicFrame(item: AvatarFrame, access: CosmeticAccess) {
  return {
    id: item.id,
    label: item.label,
    listed: item.listed,
    ...lockOf(access, 'frame', item.id),
    colors: item.colors,
    glow: item.glow,
    sparks: item.sparks,
    edges: item.edges,
  };
}

/** Значок: иконка — либо URL файла, либо пиксели с палитрой (клиент рисует сам). */
function toPublicBadge(item: AvatarBadge, version: string) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    hint: item.hint ?? null,
    listed: item.listed,
    icon: 'file' in item.icon ? { url: `${FILES_PREFIX}${item.icon.file}?v=${version}` } : item.icon,
  };
}

export async function registerAvatarsRoutes(app: FastifyInstance): Promise<void> {
  try {
    await loadAvatarCatalog();
  } catch (err: unknown) {
    app.log.error({ err }, 'avatar catalog');
  }

  app.get(
    '/api/v1/avatars',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const [catalog, access] = await Promise.all([loadAvatarCatalog(), loadCosmeticAccess(userId)]);
      return reply.send(
        ok({
          version: catalog.version,
          characters: catalog.characters.map((item) => ({
            ...toPublicCharacter(item, catalog.version),
            ...lockOf(access, 'character', item.id),
          })),
          backgrounds: catalog.backgrounds.map((item) => ({
            ...toPublicBackground(item, catalog.version),
            ...lockOf(access, 'background', item.id),
          })),
          frames: catalog.frames.map((frame) => toPublicFrame(frame, access)),
          badges: catalog.badges.map((item) => toPublicBadge(item, catalog.version)),
          titles: catalog.titles.map((item) => ({
            id: item.id,
            label: item.label,
            badge: item.badge ?? null,
            listed: item.listed,
          })),
        }),
      );
    },
  );

  /** Без auth: <img> не отправляет bearer, а пресеты не секретны. */
  app.get<{ Params: { file: string } }>('/api/v1/avatars/files/:file', async (request, reply) => {
    const catalog = await loadAvatarCatalog();
    if (!isCatalogFile(catalog, request.params.file)) {
      throw new AppError('NOT_FOUND', 404, 'Avatar not found');
    }
    const body = await readFile(avatarFilePath(request.params.file));
    return reply
      .header('Content-Type', 'image/webp')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(body);
  });
}

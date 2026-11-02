import type { CustomEmoji } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { processEmoji } from '../attachments/image-pipeline.js';
import { removeEmojiFile, writeEmojiFile } from './emoji-storage.js';
import { MAX_CUSTOM_EMOJIS } from './emojis.schemas.js';

export type CustomEmojiDto = { id: number; name: string; url: string; width: number; height: number };

/** Ссылка неизменна: файл после загрузки не меняется (переименование файл не трогает). */
export function emojiUrl(row: Pick<CustomEmoji, 'id' | 'createdAt'>): string {
  return `/api/v1/emojis/${row.id}.webp?v=${row.createdAt.getTime()}`;
}

function toEmojiDto(row: CustomEmoji): CustomEmojiDto {
  return { id: row.id, name: row.name, url: emojiUrl(row), width: row.width, height: row.height };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/** `deleted_id` — клиент сам убирает реакции этим смайликом из загруженных сообщений (по сообщениям не рассылаем). */
function notifyChanged(deletedId?: number): void {
  publishRealtimeEvent('emoji:list_changed', deletedId !== undefined ? { deleted_id: deletedId } : {});
}

export async function listEmojis(): Promise<{ emojis: CustomEmojiDto[]; limit: number }> {
  const rows = await prisma.customEmoji.findMany({ orderBy: { id: 'asc' } });
  return { emojis: rows.map(toEmojiDto), limit: MAX_CUSTOM_EMOJIS };
}

export async function emojiExists(id: number): Promise<boolean> {
  return (await prisma.customEmoji.count({ where: { id } })) > 0;
}

export async function createEmoji(actorId: number, name: string, file: Buffer): Promise<CustomEmojiDto> {
  // Быстрый отказ до перекодирования; точная проверка — ниже, под блокировкой.
  if ((await prisma.customEmoji.count()) >= MAX_CUSTOM_EMOJIS) {
    throw new AppError('EMOJI_LIMIT', 409, `At most ${MAX_CUSTOM_EMOJIS} custom emojis are allowed`);
  }
  const image = await processEmoji(file);
  let row: CustomEmoji;
  try {
    row = await prisma.$transaction(async (tx) => {
      // Две параллельные загрузки не должны вместе перешагнуть лимит.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hooba:custom-emoji'))`;
      if ((await tx.customEmoji.count()) >= MAX_CUSTOM_EMOJIS) {
        throw new AppError('EMOJI_LIMIT', 409, `At most ${MAX_CUSTOM_EMOJIS} custom emojis are allowed`);
      }
      const created = await tx.customEmoji.create({
        data: { name, width: image.width, height: image.height, sizeBytes: image.data.length, createdById: actorId },
      });
      await tx.moderationLog.create({ data: { actorId, action: 'EMOJI_CREATE', reason: name } });
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('EMOJI_NAME_TAKEN', 409, 'Emoji with this name already exists');
    }
    throw error;
  }
  try {
    await writeEmojiFile(row.id, image.data);
  } catch (error) {
    await prisma.customEmoji.delete({ where: { id: row.id } }).catch(() => undefined);
    throw error;
  }
  notifyChanged();
  return toEmojiDto(row);
}

export async function renameEmoji(id: number, name: string): Promise<CustomEmojiDto> {
  try {
    const row = await prisma.customEmoji.update({ where: { id }, data: { name } });
    notifyChanged();
    return toEmojiDto(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('EMOJI_NAME_TAKEN', 409, 'Emoji with this name already exists');
    }
    if ((error as { code?: unknown }).code === 'P2025') {
      throw new AppError('NOT_FOUND', 404, 'Emoji not found');
    }
    throw error;
  }
}

/** Реакции этим смайликом удаляются каскадом; клиенты убирают их сами по `emoji:list_changed`. */
export async function deleteEmoji(actorId: number, id: number): Promise<void> {
  const row = await prisma.customEmoji.findUnique({ where: { id }, select: { name: true } });
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Emoji not found');
  }
  await prisma.$transaction([
    prisma.customEmoji.delete({ where: { id } }),
    prisma.moderationLog.create({ data: { actorId, action: 'EMOJI_DELETE', reason: row.name } }),
  ]);
  await removeEmojiFile(id);
  notifyChanged(id);
}

import { randomUUID } from 'node:crypto';
import type { Attachment, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertCanAttachFiles } from '../../core/permissions/permissions.js';
import { channelVisibleWhere } from '../../core/permissions/channel-visibility.js';
import { processImage } from './image-pipeline.js';
import {
  freeDiskBytes,
  removeAttachmentFiles,
  signedAttachmentUrl,
  storageConfig,
  writeAttachmentFiles,
} from './attachment-storage.js';

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
/** Загружено, но не отправлено — не больше стольких на пользователя (лоток composer + запас). */
const MAX_PENDING_PER_USER = 12;
/** Сколько байт (после перекодирования) один участник может загрузить за сутки. */
const USER_DAILY_BYTES = 300 * 1024 * 1024;
/** Неотправленные вложения старше этого удаляет фоновая очистка. */
export const PENDING_TTL_MS = 60 * 60 * 1000;
/** Квота: при заполнении выше HIGH удаляются самые старые картинки, пока не станет ниже LOW. */
const QUOTA_HIGH = 0.8;
const QUOTA_LOW = 0.7;
const PURGE_BATCH = 100;

export type AttachmentDto = {
  id: string;
  name: string;
  width: number;
  height: number;
  /** true — файл удалён (очистка хранилища); показывать заглушку. */
  purged: boolean;
  /** Пути относительно сервера API (`/api/v1/...`), подписаны и живут ~сутки. */
  url: string | null;
  thumb_url: string | null;
};

export function toAttachmentDto(row: Attachment): AttachmentDto {
  const purged = row.purgedAt !== null;
  return {
    id: row.id,
    name: row.originalName,
    width: row.width,
    height: row.height,
    purged,
    url: purged ? null : signedAttachmentUrl(row.id, 'full'),
    thumb_url: purged ? null : signedAttachmentUrl(row.id, 'thumb'),
  };
}

/** Имя для показа и скачивания: без пути и управляющих символов, расширение — всегда .webp. */
export function sanitizeAttachmentName(raw: string | undefined): string {
  const last = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const base = [...last]
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f && !'"<>|:*?'.includes(ch))
    .join('')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 80);
  return `${base || 'image'}.webp`;
}

async function assertUploadAllowed(userId: number, channelId: number): Promise<void> {
  const ch = await prisma.channel.findFirst({
    where: { id: channelId, isDeleted: false, ...channelVisibleWhere(userId) },
    select: { channelType: true },
  });
  if (!ch) {
    throw new AppError('NOT_FOUND', 404, 'Channel not found');
  }
  if (ch.channelType !== 'TEXT') {
    throw new AppError('VALIDATION_ERROR', 400, 'Attachments are allowed only in text channels');
  }
  await assertCanAttachFiles(userId, channelId);

  const [pending, daily] = await Promise.all([
    prisma.attachment.count({ where: { uploaderId: userId, messageId: null, purgedAt: null } }),
    prisma.attachment.aggregate({
      where: { uploaderId: userId, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      _sum: { sizeBytes: true },
    }),
  ]);
  if (pending >= MAX_PENDING_PER_USER) {
    throw new AppError('TOO_MANY_PENDING', 429, 'Too many unsent attachments');
  }
  if ((daily._sum.sizeBytes ?? 0) >= USER_DAILY_BYTES) {
    throw new AppError('UPLOAD_QUOTA_EXCEEDED', 429, 'Daily upload limit reached');
  }
}

async function ensureCapacity(): Promise<void> {
  const free = await freeDiskBytes();
  if (free !== null && free < storageConfig().minFreeBytes) {
    // Диск почти полон не из-за нас (или квота велика) — освобождаем что можем и отказываем.
    void enforceStorageQuota().catch(() => undefined);
    throw new AppError('STORAGE_FULL', 507, 'Server storage is full');
  }
  if ((await usedBytes()) > storageConfig().maxBytes * QUOTA_HIGH) {
    await enforceStorageQuota();
  }
}

export async function uploadAttachment(
  userId: number,
  channelId: number,
  file: { buffer: Buffer; filename?: string },
): Promise<AttachmentDto> {
  await assertUploadAllowed(userId, channelId);
  await ensureCapacity();

  const image = await processImage(file.buffer);
  const id = randomUUID();
  await writeAttachmentFiles(id, { full: image.full, thumb: image.thumb });
  try {
    const row = await prisma.attachment.create({
      data: {
        id,
        uploaderId: userId,
        channelId,
        originalName: sanitizeAttachmentName(file.filename),
        width: image.width,
        height: image.height,
        sizeBytes: image.full.length + image.thumb.length,
      },
    });
    return toAttachmentDto(row);
  } catch (error) {
    await removeAttachmentFiles(id);
    throw error;
  }
}

/** Отменить загрузку из лотка composer до отправки. */
export async function discardPendingAttachment(userId: number, id: string): Promise<void> {
  // Сначала строка (атомарно, только если ещё не отправлена), потом файлы.
  const { count } = await prisma.attachment.deleteMany({ where: { id, uploaderId: userId, messageId: null } });
  if (count !== 1) {
    throw new AppError('NOT_FOUND', 404, 'Attachment not found');
  }
  await removeAttachmentFiles(id);
}

export function normalizeAttachmentIds(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return null;
  }
  const ids = raw.filter((value): value is string => typeof value === 'string');
  if (ids.length !== raw.length || new Set(ids).size !== ids.length) {
    return null;
  }
  return ids;
}

/** Привязать загруженные автором вложения к новому сообщению (внутри транзакции создания). */
export async function claimAttachments(
  tx: Prisma.TransactionClient,
  params: { ids: string[]; authorId: number; channelId: number; messageId: number },
): Promise<void> {
  for (const [position, id] of params.ids.entries()) {
    const { count } = await tx.attachment.updateMany({
      where: {
        id,
        uploaderId: params.authorId,
        channelId: params.channelId,
        messageId: null,
        purgedAt: null,
      },
      data: { messageId: params.messageId, position },
    });
    if (count !== 1) {
      throw new AppError('ATTACHMENT_INVALID', 400, 'Attachment is missing or already used');
    }
  }
}

/** Удалить файлы и пометить строки; сообщения при этом показывают заглушку. */
async function purgeRows(ids: string[]): Promise<void> {
  for (const id of ids) {
    await removeAttachmentFiles(id);
  }
  if (ids.length > 0) {
    await prisma.attachment.updateMany({ where: { id: { in: ids } }, data: { purgedAt: new Date() } });
  }
}

export async function purgeMessageAttachments(messageId: number): Promise<void> {
  const rows = await prisma.attachment.findMany({
    where: { messageId, purgedAt: null },
    select: { id: true },
  });
  await purgeRows(rows.map((row) => row.id));
}

/** Файл для отдачи: строка существует и не очищена. */
export async function findServableAttachment(id: string): Promise<Pick<Attachment, 'id' | 'originalName'> | null> {
  return prisma.attachment.findFirst({
    where: { id, purgedAt: null },
    select: { id: true, originalName: true },
  });
}

async function usedBytes(): Promise<number> {
  const agg = await prisma.attachment.aggregate({ where: { purgedAt: null }, _sum: { sizeBytes: true } });
  return agg._sum.sizeBytes ?? 0;
}

let quotaRun: Promise<number> | null = null;

/** Если хранилище занято больше чем на 80% — удалить самые старые картинки до 70%. Возвращает число удалённых. */
export function enforceStorageQuota(): Promise<number> {
  quotaRun ??= (async () => {
    const max = storageConfig().maxBytes;
    let used = await usedBytes();
    if (used <= max * QUOTA_HIGH) {
      return 0;
    }
    let purged = 0;
    while (used > max * QUOTA_LOW) {
      // Свежие неотправленные не трогаем: пользователь вот-вот нажмёт «Отправить».
      const rows = await prisma.attachment.findMany({
        where: {
          purgedAt: null,
          OR: [{ messageId: { not: null } }, { createdAt: { lt: new Date(Date.now() - PENDING_TTL_MS) } }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: PURGE_BATCH,
        select: { id: true, sizeBytes: true },
      });
      if (rows.length === 0) {
        break;
      }
      const batch: string[] = [];
      for (const row of rows) {
        if (used <= max * QUOTA_LOW) break;
        batch.push(row.id);
        used -= row.sizeBytes;
      }
      await purgeRows(batch);
      purged += batch.length;
    }
    return purged;
  })().finally(() => {
    quotaRun = null;
  });
  return quotaRun;
}

/** Неотправленные вложения старше часа — удалить вместе со строками. */
export async function deleteStalePendingAttachments(): Promise<number> {
  // DELETE … RETURNING: строка, которую в этот момент привязывают к сообщению, не удалится, а её файлы — тоже.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    DELETE FROM "Attachment"
    WHERE "messageId" IS NULL AND "createdAt" < ${new Date(Date.now() - PENDING_TTL_MS)}
    RETURNING "id"::text AS "id"`;
  for (const row of rows) {
    await removeAttachmentFiles(row.id);
  }
  return rows.length;
}

export async function runAttachmentMaintenance(): Promise<{ stale: number; purged: number }> {
  const stale = await deleteStalePendingAttachments();
  const purged = await enforceStorageQuota();
  return { stale, purged };
}

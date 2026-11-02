import type { Attachment, ChannelType, Message } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { recordMessageActivity } from '../activity/activity.service.js';
import { assertCanAttachFiles, assertCanSendMessages } from '../../core/permissions/permissions.js';
import { channelVisibleWhere } from '../../core/permissions/channel-visibility.js';
import { AppError } from '../../core/errors/app-error.js';
import { hasStaffKey, userSystemRoleKeys } from '../../core/auth/roles.js';
import { MAX_MESSAGE_CONTENT, normalizeMessageContent } from './messages-content.js';
import { censorMessageContent } from '../word-filter/word-filter.service.js';
import {
  claimAttachments,
  purgeMessageAttachments,
  toAttachmentDto,
} from '../attachments/attachments.service.js';
import { groupReactions, reactionRowSelect, type ReactionRow } from './reactions.js';

/** Связи, нужные `toMessageDto`. */
const messageInclude = {
  author: { select: { username: true } },
  attachments: { orderBy: { position: 'asc' as const } },
  reactions: { orderBy: { id: 'asc' as const }, select: reactionRowSelect },
};

/**
 * Нормализация, фильтр запрещённых слов и лимиты. В БД попадает уже замаскированный текст.
 * `allowEmpty` — у сообщения есть картинки, текст необязателен.
 */
async function preparedContent(rawContent: string, allowEmpty = false): Promise<string> {
  if (rawContent.length > MAX_MESSAGE_CONTENT * 4) {
    throw new AppError('VALIDATION_ERROR', 400, `Message content exceeds ${MAX_MESSAGE_CONTENT} characters`);
  }
  const content = normalizeMessageContent(rawContent);
  if (content.length === 0) {
    if (allowEmpty) {
      return '';
    }
    throw new AppError('VALIDATION_ERROR', 400, 'Message content cannot be empty');
  }
  if (content.length > MAX_MESSAGE_CONTENT) {
    throw new AppError('VALIDATION_ERROR', 400, `Message content exceeds ${MAX_MESSAGE_CONTENT} characters`);
  }
  return censorMessageContent(content);
}

export function toMessageDto(
  row: Message & { author: { username: string }; attachments?: Attachment[]; reactions?: ReactionRow[] },
) {
  return {
    id: row.id,
    channel_id: row.channelId,
    author_id: row.authorId,
    author_username: row.author.username,
    content: row.content,
    attachments: (row.attachments ?? []).map(toAttachmentDto),
    reactions: groupReactions(row.reactions ?? []),
    is_deleted: row.isDeleted,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function findChannelAccessibleToUser(channelId: number, userId: number) {
  const ch = await prisma.channel.findFirst({
    where: {
      id: channelId,
      isDeleted: false,
      ...channelVisibleWhere(userId),
    },
    select: { id: true, channelType: true },
  });
  return ch;
}

function assertTextChannel(channelType: ChannelType) {
  if (channelType === 'VOICE') {
    throw new AppError('VALIDATION_ERROR', 400, 'Text messages are not allowed in voice channels');
  }
}

export async function listMessages(
  channelId: number,
  userId: number,
  page: {
    offset: number;
    limit: number;
    before?: { createdAt: Date; id: number };
  },
) {
  const ch = await findChannelAccessibleToUser(channelId, userId);
  if (!ch) {
    throw new AppError('NOT_FOUND', 404, 'Channel not found');
  }

  const rows = await prisma.message.findMany({
    where: {
      channelId,
      isDeleted: false,
      ...(page.before
        ? {
            OR: [
              { createdAt: { lt: page.before.createdAt } },
              { createdAt: page.before.createdAt, id: { lt: page.before.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: page.before ? 0 : page.offset,
    take: page.limit,
    include: messageInclude,
  });
  rows.reverse();
  return rows.map(toMessageDto);
}

export async function createMessage(
  channelId: number,
  authorId: number,
  rawContent: string,
  attachmentIds: string[] = [],
) {
  const content = await preparedContent(rawContent, attachmentIds.length > 0);

  const ch = await findChannelAccessibleToUser(channelId, authorId);
  if (!ch) {
    throw new AppError('NOT_FOUND', 404, 'Channel not found');
  }
  assertTextChannel(ch.channelType);
  await assertCanSendMessages(authorId, channelId);
  if (attachmentIds.length > 0) {
    // Право могли отозвать между загрузкой и отправкой.
    await assertCanAttachFiles(authorId, channelId);
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { channelId, authorId, content } });
    if (attachmentIds.length > 0) {
      await claimAttachments(tx, { ids: attachmentIds, authorId, channelId, messageId: created.id });
    }
    return tx.message.findUniqueOrThrow({ where: { id: created.id }, include: messageInclude });
  });
  recordMessageActivity(authorId, channelId, content, attachmentIds.length > 0, (error) => {
    console.error('[activity] message', error);
  });
  return toMessageDto(row);
}

/** Закреплённое сообщение канала; `message: null` — ничего не закреплено. */
export type ChannelPinDto = {
  channel_id: number;
  message: ReturnType<typeof toMessageDto> | null;
  pinned_by_id: number | null;
  pinned_at: string | null;
};

export function emptyPinDto(channelId: number): ChannelPinDto {
  return { channel_id: channelId, message: null, pinned_by_id: null, pinned_at: null };
}

const pinSelect = {
  id: true,
  pinnedById: true,
  pinnedAt: true,
  pinnedMessage: { include: messageInclude },
} as const;

function toPinDto(row: {
  id: number;
  pinnedById: number | null;
  pinnedAt: Date | null;
  pinnedMessage: (Message & { author: { username: string }; attachments: Attachment[] }) | null;
}): ChannelPinDto {
  // Удалённое сообщение снимается с закрепа сразу, но на всякий случай не отдаём его.
  if (!row.pinnedMessage || row.pinnedMessage.isDeleted) {
    return emptyPinDto(row.id);
  }
  return {
    channel_id: row.id,
    message: toMessageDto(row.pinnedMessage),
    pinned_by_id: row.pinnedById,
    pinned_at: row.pinnedAt?.toISOString() ?? null,
  };
}

async function assertVisibleTextChannel(channelId: number, userId: number): Promise<void> {
  const ch = await findChannelAccessibleToUser(channelId, userId);
  if (!ch) {
    throw new AppError('NOT_FOUND', 404, 'Channel not found');
  }
  assertTextChannel(ch.channelType);
}

export async function getChannelPin(channelId: number, userId: number): Promise<ChannelPinDto> {
  await assertVisibleTextChannel(channelId, userId);
  const row = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, select: pinSelect });
  return toPinDto(row);
}

/** Закрепить сообщение (только staff — проверяет роут). Прежний закреп канала заменяется. */
export async function pinMessage(messageId: number, userId: number): Promise<ChannelPinDto> {
  const existing = await prisma.message.findFirst({
    where: { id: messageId, isDeleted: false },
    select: { channelId: true },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  const accessible = await findChannelAccessibleToUser(existing.channelId, userId);
  if (!accessible) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  assertTextChannel(accessible.channelType);
  const row = await prisma.channel.update({
    where: { id: existing.channelId },
    data: { pinnedMessageId: messageId, pinnedById: userId, pinnedAt: new Date() },
    select: pinSelect,
  });
  return toPinDto(row);
}

/** Снять закреп канала (только staff — проверяет роут). Повторный вызов ничего не ломает. */
export async function unpinChannel(channelId: number, userId: number): Promise<ChannelPinDto> {
  await assertVisibleTextChannel(channelId, userId);
  await prisma.channel.update({
    where: { id: channelId },
    data: { pinnedMessageId: null, pinnedById: null, pinnedAt: null },
  });
  return emptyPinDto(channelId);
}

export async function assertOwnLiveMessage(messageId: number, userId: number): Promise<number> {
  const existing = await prisma.message.findFirst({
    where: { id: messageId, isDeleted: false },
    select: { authorId: true, channelId: true, channel: { select: { channelType: true } } },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  if (existing.authorId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'You can only change your own messages');
  }
  const accessible = await findChannelAccessibleToUser(existing.channelId, userId);
  if (!accessible) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  assertTextChannel(existing.channel.channelType);
  return existing.channelId;
}

export async function updateMessageBody(messageId: number, userId: number, rawContent: string) {
  const existing = await prisma.message.findFirst({
    where: { id: messageId, isDeleted: false },
    include: {
      channel: { select: { channelType: true } },
      _count: { select: { attachments: { where: { purgedAt: null } } } },
    },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  if (existing.authorId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'You can only edit your own messages');
  }
  const accessible = await findChannelAccessibleToUser(existing.channelId, userId);
  if (!accessible) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  assertTextChannel(existing.channel.channelType);
  // С запретом писать нельзя и править свои сообщения (удалять — можно).
  await assertCanSendMessages(userId, existing.channelId);
  // Текст сообщения с картинками можно стереть целиком — останутся картинки.
  const content = await preparedContent(rawContent, existing._count.attachments > 0);

  const row = await prisma.message.update({
    where: { id: messageId },
    data: { content },
    include: messageInclude,
  });
  return toMessageDto(row);
}

/**
 * Кто может удалить сообщение: автор — своё; OWNER/ADMIN — чужое в видимом им канале.
 * Сообщение владельца или администратора чужими руками удаляет только владелец (как бан/кик).
 */
export async function assertDeletableMessage(
  messageId: number,
  userId: number,
): Promise<{ channelId: number; authorId: number; content: string; byModerator: boolean }> {
  const existing = await prisma.message.findFirst({
    where: { id: messageId, isDeleted: false },
    select: { authorId: true, channelId: true, content: true, channel: { select: { channelType: true } } },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  const accessible = await findChannelAccessibleToUser(existing.channelId, userId);
  if (!accessible) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  assertTextChannel(existing.channel.channelType);
  const base = { channelId: existing.channelId, authorId: existing.authorId, content: existing.content };
  if (existing.authorId === userId) {
    return { ...base, byModerator: false };
  }
  const actorRoles = await userSystemRoleKeys(userId);
  if (!hasStaffKey(actorRoles)) {
    throw new AppError('FORBIDDEN', 403, 'You can only delete your own messages');
  }
  if (!actorRoles.has('OWNER') && hasStaffKey(await userSystemRoleKeys(existing.authorId))) {
    throw new AppError('FORBIDDEN', 403, 'Only owner can delete messages of an owner or an admin');
  }
  return { ...base, byModerator: true };
}

/** Для журнала модерации: начало текста или пометка, что были только картинки. */
function deletedMessageExcerpt(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) {
    return '[только картинки]';
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

export async function softDeleteMessage(
  messageId: number,
  userId: number,
): Promise<{ id: number; channel_id: number; unpinned: boolean }> {
  const target = await assertDeletableMessage(messageId, userId);
  const unpinned = await prisma.$transaction(async (tx) => {
    await tx.message.update({
      where: { id: messageId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    // Мягкое удаление не срабатывает на FK — закреп снимаем сами.
    const pins = await tx.channel.updateMany({
      where: { pinnedMessageId: messageId },
      data: { pinnedMessageId: null, pinnedById: null, pinnedAt: null },
    });
    if (target.byModerator) {
      await tx.moderationLog.create({
        data: {
          actorId: userId,
          targetUserId: target.authorId,
          action: 'MESSAGE_DELETE',
          reason: deletedMessageExcerpt(target.content),
          channelId: target.channelId,
        },
      });
    }
    return pins.count > 0;
  });
  await purgeMessageAttachments(messageId);
  return { id: messageId, channel_id: target.channelId, unpinned };
}

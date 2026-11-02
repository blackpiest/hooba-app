import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertCanReact } from '../../core/permissions/permissions.js';
import { findChannelAccessibleToUser } from './messages.service.js';
import {
  groupReactions,
  MAX_REACTION_KINDS_PER_MESSAGE,
  parseReactionKey,
  reactionRowSelect,
  type ReactionDto,
} from './reactions.js';

export type MessageReactionsDto = { message_id: number; channel_id: number; reactions: ReactionDto[] };

export async function messageReactions(messageId: number): Promise<ReactionDto[]> {
  const rows = await prisma.messageReaction.findMany({
    where: { messageId },
    orderBy: { id: 'asc' },
    select: reactionRowSelect,
  });
  return groupReactions(rows);
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

/**
 * Поставить (`on`) или снять реакцию. Оба действия идемпотентны.
 * Снять свою реакцию можно и без права `react` — например, после того как канал ограничили.
 */
export async function setReaction(
  messageId: number,
  userId: number,
  rawKey: string,
  on: boolean,
): Promise<MessageReactionsDto> {
  const key = parseReactionKey(rawKey);
  if (!key) {
    throw new AppError('VALIDATION_ERROR', 400, 'Invalid reaction emoji');
  }
  const message = await prisma.message.findFirst({
    where: { id: messageId, isDeleted: false },
    select: { channelId: true },
  });
  const channel = message ? await findChannelAccessibleToUser(message.channelId, userId) : null;
  if (!message || !channel || channel.channelType !== 'TEXT') {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }

  if (on) {
    await assertCanReact(userId, message.channelId);
    const kinds = await prisma.messageReaction.findMany({
      where: { messageId },
      distinct: ['emoji'],
      select: { emoji: true },
    });
    if (kinds.length >= MAX_REACTION_KINDS_PER_MESSAGE && !kinds.some((kind) => kind.emoji === key.emoji)) {
      throw new AppError(
        'REACTION_LIMIT',
        409,
        `At most ${MAX_REACTION_KINDS_PER_MESSAGE} different reactions per message`,
      );
    }
    try {
      await prisma.messageReaction.create({
        data: { messageId, userId, emoji: key.emoji, customEmojiId: key.customEmojiId },
      });
    } catch (error) {
      if (isPrismaCode(error, 'P2003')) {
        throw new AppError('NOT_FOUND', 404, 'Emoji not found');
      }
      if (!isPrismaCode(error, 'P2002')) {
        throw error;
      }
    }
  } else {
    await prisma.messageReaction.deleteMany({ where: { messageId, userId, emoji: key.emoji } });
  }

  return { message_id: messageId, channel_id: message.channelId, reactions: await messageReactions(messageId) };
}

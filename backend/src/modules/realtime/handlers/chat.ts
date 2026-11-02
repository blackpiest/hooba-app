import type { WebSocket } from 'ws';
import { AppError } from '../../../core/errors/app-error.js';
import { prisma } from '../../../core/database/prisma.js';
import { consumeRateLimit } from '../../../core/http/rate-limit.js';
import { MAX_MESSAGE_CONTENT, normalizeMessageContent } from '../../messages/messages-content.js';
import * as messagesService from '../../messages/messages.service.js';
import { normalizeAttachmentIds } from '../../attachments/attachments.service.js';
import {
  broadcastChannelEvent,
  broadcastChannelExcept,
  channelSockets,
  leaveJoinedChannel,
  readFiniteId,
  sendError,
  sendWs,
  socketMeta,
  subscribeChannel,
} from '../ws-registry.js';
import type { WsHandler, WsHandlers } from './types.js';

const rateWindowMs = 10_000;
const rateMax = 30;

function checkRateLimit(userId: number): boolean {
  return consumeRateLimit(`ws-message:${userId}`, rateMax, rateWindowMs);
}

/** Сообщение слышат и те, кто сейчас в другом канале. Автор и уже подписанные сокеты пропускаются. */
async function notifyMessageOutsideChannel(
  channelId: number,
  authorId: number,
  message: unknown,
): Promise<void> {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, isDeleted: false },
    select: { isPrivate: true, members: { select: { userId: true } } },
  });
  if (!channel) {
    return;
  }
  const members = channel.isPrivate ? new Set(channel.members.map((member) => member.userId)) : null;
  const inRoom = channelSockets.get(channelId);
  const payload = JSON.stringify({ event: 'message:new', data: { message }, meta: {} });
  for (const [socket, meta] of socketMeta) {
    if (meta.phase !== 'authed' || meta.userId === authorId) {
      continue;
    }
    if (members && !members.has(meta.userId)) {
      continue;
    }
    if (inRoom?.has(socket) || socket.readyState !== 1) {
      continue;
    }
    socket.send(payload);
  }
}

function sendAck(
  socket: WebSocket,
  tempId: string,
  errorCode: string,
  requestId: string | undefined,
) {
  sendWs(socket, 'message:ack', { temp_id: tempId, success: false, error_code: errorCode }, requestId);
}

const sendMessage: WsHandler = async ({ socket, meta, data, requestId }) => {
  if (!checkRateLimit(meta.userId)) {
    sendError(socket, 'RATE_LIMITED', requestId);
    return;
  }
  const tempId =
    typeof data.temp_id === 'string'
      ? data.temp_id
      : typeof data.tempId === 'string'
        ? data.tempId
        : '';
  const channelId = readFiniteId(data.channel_id ?? data.channelId);
  const content = typeof data.content === 'string' ? data.content : '';
  const attachmentIds = normalizeAttachmentIds(data.attachment_ids ?? data.attachmentIds);
  if (!tempId) {
    sendError(socket, 'INVALID_EVENT', requestId);
    return;
  }
  if (channelId === null) {
    sendError(socket, 'INVALID_EVENT', requestId);
    return;
  }
  if (meta.joinedChannelId !== channelId) {
    sendError(socket, 'FORBIDDEN', requestId);
    return;
  }
  if (attachmentIds === null) {
    sendAck(socket, tempId, 'ATTACHMENT_INVALID', requestId);
    return;
  }
  if (content.length > MAX_MESSAGE_CONTENT * 4) {
    sendAck(socket, tempId, 'MESSAGE_TOO_LONG', requestId);
    return;
  }
  const trimmed = normalizeMessageContent(content);
  if (trimmed.length === 0 && attachmentIds.length === 0) {
    sendAck(socket, tempId, 'MESSAGE_EMPTY', requestId);
    return;
  }
  if (trimmed.length > MAX_MESSAGE_CONTENT) {
    sendAck(socket, tempId, 'MESSAGE_TOO_LONG', requestId);
    return;
  }
  try {
    const realMessage = await messagesService.createMessage(channelId, meta.userId, trimmed, attachmentIds);
    sendWs(
      socket,
      'message:ack',
      {
        temp_id: tempId,
        message_id: realMessage.id,
        created_at: realMessage.created_at,
        success: true,
        real_message: realMessage,
      },
      requestId,
    );
    await broadcastChannelExcept(channelId, 'message:new', { message: realMessage }, socket);
    try {
      await notifyMessageOutsideChannel(channelId, meta.userId, realMessage);
    } catch {
      /* сообщение уже сохранено; доставка в другие каналы не должна ломать отправку */
    }
  } catch (e: unknown) {
    if (e instanceof AppError) {
      if (e.code === 'SEND_FORBIDDEN' || e.code === 'ATTACH_FORBIDDEN' || e.code === 'ATTACHMENT_INVALID') {
        sendAck(socket, tempId, e.code, requestId);
        return;
      }
      if (e.statusCode === 404) {
        sendAck(socket, tempId, 'CHANNEL_NOT_FOUND', requestId);
        return;
      }
      if (e.code === 'VALIDATION_ERROR' && e.message.includes('voice')) {
        sendAck(socket, tempId, 'FORBIDDEN', requestId);
        return;
      }
    }
    sendAck(socket, tempId, 'INVALID_EVENT', requestId);
  }
};

/** message:edit | message:delete. */
const changeMessage: WsHandler = async ({ socket, event, meta, data, requestId }) => {
  if (!checkRateLimit(meta.userId)) {
    sendWs(socket, 'message:error', { code: 'RATE_LIMITED', message: 'RATE_LIMITED' }, requestId);
    return;
  }
  const messageId = readFiniteId(data.message_id ?? data.messageId);
  if (messageId === null) {
    sendWs(socket, 'message:error', { code: 'INVALID_EVENT', message: 'INVALID_EVENT' }, requestId);
    return;
  }
  try {
    // Правка — только своё; удалить чужое может и модератор.
    const channelId =
      event === 'message:edit'
        ? await messagesService.assertOwnLiveMessage(messageId, meta.userId)
        : (await messagesService.assertDeletableMessage(messageId, meta.userId)).channelId;
    if (meta.joinedChannelId !== channelId) {
      sendWs(socket, 'message:error', { code: 'CHANNEL_FORBIDDEN', message: 'CHANNEL_FORBIDDEN' }, requestId);
      return;
    }
    if (event === 'message:edit') {
      const content = typeof data.content === 'string' ? data.content : '';
      const message = await messagesService.updateMessageBody(messageId, meta.userId, content);
      await broadcastChannelEvent(channelId, 'message:edited', { message });
    } else {
      const removed = await messagesService.softDeleteMessage(messageId, meta.userId);
      await broadcastChannelEvent(channelId, 'message:deleted', {
        message_id: removed.id,
        channel_id: removed.channel_id,
      });
      if (removed.unpinned) {
        await broadcastChannelEvent(channelId, 'channel:pin', messagesService.emptyPinDto(channelId));
      }
    }
  } catch (e: unknown) {
    if (e instanceof AppError) {
      const code =
        e.code === 'SEND_FORBIDDEN'
          ? 'SEND_FORBIDDEN'
          : e.statusCode === 404
          ? 'MESSAGE_NOT_FOUND'
          : e.statusCode === 403
            ? 'MESSAGE_FORBIDDEN'
            : e.message.includes('empty')
              ? 'MESSAGE_EMPTY'
              : e.message.includes('exceeds')
                ? 'MESSAGE_TOO_LONG'
                : 'VALIDATION_ERROR';
      sendWs(socket, 'message:error', { code, message: code }, requestId);
      return;
    }
    sendWs(socket, 'message:error', { code: 'INVALID_EVENT', message: 'INVALID_EVENT' }, requestId);
  }
};

export const chatHandlers: WsHandlers = {
  'channel:join': async ({ socket, meta, data, requestId }) => {
    const channelId = readFiniteId(data.channel_id ?? data.channelId);
    if (channelId === null) {
      sendError(socket, 'INVALID_EVENT', requestId);
      return;
    }
    leaveJoinedChannel(socket, meta);
    const ch = await messagesService.findChannelAccessibleToUser(channelId, meta.userId);
    if (!ch) {
      sendError(socket, 'CHANNEL_NOT_FOUND', requestId);
      return;
    }
    meta.joinedChannelId = channelId;
    subscribeChannel(channelId, socket);
    sendWs(socket, 'channel:joined', { channel_id: channelId }, requestId);
  },

  'channel:leave': ({ socket, meta, requestId }) => {
    leaveJoinedChannel(socket, meta);
    sendWs(socket, 'channel:left', { channel_id: null }, requestId);
  },

  'message:send': sendMessage,
  'message:edit': changeMessage,
  'message:delete': changeMessage,
};

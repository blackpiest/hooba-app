import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { userIsStaff } from '../../auth/auth.middleware.js';
import { assertModerationAllowed } from '../../moderation/moderation.service.js';
import { AppError } from '../../../core/errors/app-error.js';
import { getChannelPermissions } from '../../../core/permissions/permissions.js';
import * as voiceService from '../../voice/voice.service.js';
import {
  canJoinVoiceChannel,
  getVoiceRoomsSnapshot,
  joinVoiceRoom,
  kickVoiceUser,
  leaveVoiceRoom,
  moveVoiceUser,
  setVoiceDeafen,
  setVoiceMute,
  setVoiceServerMute,
  setVoiceSpeakDenied,
  setVoiceSpeaking,
} from '../../voice/voice-registry.js';
import { handleVoiceMediasoupSignal, stopUserScreenShare } from '../../voice/mediasoup-voice.service.js';
import {
  cachedVoiceChannelAccess,
  canSeeVoiceRoom,
  loadVoiceChannelAccess,
  missingVoiceChannelAccess,
} from '../../voice/voice-channel-access.js';
import {
  forEachAuthedUserSocket,
  identifiedSockets,
  readFiniteId,
  sendWs,
  socketMeta,
} from '../ws-registry.js';
import type { WsHandler, WsHandlers } from './types.js';

type VoiceRooms = ReturnType<typeof getVoiceRoomsSnapshot>;

function visibleVoiceRooms(rooms: VoiceRooms, userId: number): VoiceRooms {
  return rooms.filter((room) => canSeeVoiceRoom(cachedVoiceChannelAccess(room.channel_id), userId));
}

/**
 * Состав приватной голосовой комнаты видят только её участники. Доступ берётся из кэша;
 * если по какой-то комнате его нет — дозагрузить и отправить снапшот уже после этого.
 */
function withVoiceRoomsSnapshot(app: FastifyInstance, send: (rooms: VoiceRooms) => void) {
  const missing = missingVoiceChannelAccess(getVoiceRoomsSnapshot().map((room) => room.channel_id));
  if (missing.length === 0) {
    send(getVoiceRoomsSnapshot());
    return;
  }
  void loadVoiceChannelAccess(missing)
    .catch((err: unknown) => {
      app.log.error({ err }, 'voice rooms snapshot access');
    })
    .then(() => {
      send(getVoiceRoomsSnapshot());
    });
}

export function emitVoiceRoomsSnapshot(app: FastifyInstance, socket: WebSocket, userId: number) {
  withVoiceRoomsSnapshot(app, (rooms) => {
    if (socket.readyState === 1) {
      sendWs(socket, 'voice:rooms_snapshot', { rooms: visibleVoiceRooms(rooms, userId) });
    }
  });
}

export function broadcastVoiceRoomsSnapshot(app: FastifyInstance) {
  withVoiceRoomsSnapshot(app, (rooms) => {
    const payloadByUser = new Map<number, string>();
    for (const s of identifiedSockets) {
      const meta = socketMeta.get(s);
      if (s.readyState !== 1 || meta?.phase !== 'authed') continue;
      let payload = payloadByUser.get(meta.userId);
      if (payload === undefined) {
        payload = JSON.stringify({
          event: 'voice:rooms_snapshot',
          data: { rooms: visibleVoiceRooms(rooms, meta.userId) },
          meta: {},
        });
        payloadByUser.set(meta.userId, payload);
      }
      s.send(payload);
    }
  });
}

/** Роли поменялись: заглушить/разглушить по запрету роли и остановить запрещённую трансляцию. */
export async function resyncVoicePermissions(targets: { userId: number; channelId: number }[]): Promise<void> {
  for (const { userId, channelId } of targets) {
    const perms = await getChannelPermissions(userId, channelId);
    setVoiceSpeakDenied(userId, !perms.speak);
    if (!perms.screenShare) {
      stopUserScreenShare(userId);
    }
  }
}

export function forceLeaveVoiceForUser(userId: number) {
  forEachAuthedUserSocket(userId, (socket) => {
    leaveVoiceRoom(socket);
  });
}

function sendModerationResult(
  socket: WebSocket,
  ok: boolean,
  code: string | undefined,
  requestId?: string,
) {
  sendWs(socket, 'voice:moderation_result', ok ? { ok: true } : { ok: false, code }, requestId);
}

async function voiceModerationDenyCode(actorId: number, targetId: number): Promise<string | null> {
  if (!(await userIsStaff(actorId))) return 'FORBIDDEN';
  try {
    await assertModerationAllowed(actorId, targetId);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      if (err.statusCode === 403 || err.code === 'FORBIDDEN') return 'FORBIDDEN';
      if (err.code === 'NOT_FOUND') return 'NOT_FOUND';
      return 'VALIDATION_ERROR';
    }
    return 'FORBIDDEN';
  }
  return null;
}

/** voice:server_mute | voice:kick | voice:move — модерация чужого участника. */
const voiceModeration: WsHandler = async ({ app, socket, event, meta, data, requestId }) => {
  const targetId = readFiniteId(data.user_id ?? data.userId);
  if (targetId === null) {
    sendModerationResult(socket, false, 'INVALID_EVENT', requestId);
    return;
  }
  const denied = await voiceModerationDenyCode(meta.userId, targetId);
  if (denied) {
    sendModerationResult(socket, false, denied, requestId);
    return;
  }
  if (event === 'voice:server_mute') {
    if (typeof data.muted !== 'boolean') {
      sendModerationResult(socket, false, 'INVALID_EVENT', requestId);
      return;
    }
    const muted = setVoiceServerMute(targetId, data.muted);
    sendModerationResult(socket, muted.ok, muted.ok ? undefined : muted.code, requestId);
    return;
  }
  if (event === 'voice:kick') {
    const kicked = kickVoiceUser(targetId);
    sendModerationResult(socket, kicked.ok, kicked.ok ? undefined : kicked.code, requestId);
    return;
  }
  const targetChannelId = readFiniteId(data.channel_id ?? data.channelId);
  if (targetChannelId === null) {
    sendModerationResult(socket, false, 'INVALID_EVENT', requestId);
    return;
  }
  const gate = await voiceService.assertJoinableVoiceChannel(targetChannelId, targetId);
  if (!gate.ok) {
    sendModerationResult(socket, false, gate.code, requestId);
    return;
  }
  const moved = moveVoiceUser(targetId, targetChannelId);
  sendModerationResult(socket, moved.ok, moved.ok ? undefined : moved.code, requestId);
  if (moved.ok) {
    // В новом канале могут быть свои ограничения «говорить»/«транслировать».
    void resyncVoicePermissions([{ userId: targetId, channelId: targetChannelId }]).catch((err: unknown) => {
      app.log.error({ err }, 'voice permissions resync after move');
    });
  }
};

export const voiceHandlers: WsHandlers = {
  'voice:join': async ({ socket, meta, data, requestId }) => {
    const channelId = readFiniteId(data.channel_id ?? data.channelId);
    if (channelId === null) {
      sendWs(socket, 'voice:error', { code: 'INVALID_EVENT' }, requestId);
      return;
    }
    const gate = await voiceService.assertJoinableVoiceChannel(channelId, meta.userId);
    if (!gate.ok) {
      sendWs(socket, 'voice:error', { code: gate.code }, requestId);
      return;
    }
    if (!canJoinVoiceChannel(channelId, meta.userId)) {
      sendWs(socket, 'voice:error', { code: 'VOICE_ROOM_FULL' }, requestId);
      return;
    }
    const perms = await getChannelPermissions(meta.userId, channelId);
    const joined = joinVoiceRoom({
      channelId,
      userId: meta.userId,
      username: meta.username,
      socket,
      speakDenied: !perms.speak,
    });
    if (!joined.ok) {
      sendWs(socket, 'voice:error', { code: joined.code }, requestId);
      return;
    }
    sendWs(
      socket,
      'voice:joined',
      { channel_id: joined.channelId, participants: joined.roster },
      requestId,
    );
  },

  'voice:leave': ({ socket }) => {
    leaveVoiceRoom(socket);
  },

  'voice:mute': ({ socket, data, requestId }) => {
    const explicit = typeof data.muted === 'boolean' ? data.muted : undefined;
    const r = setVoiceMute(socket, explicit);
    if (!r.ok && r.code !== 'VOICE_SERVER_MUTED' && r.code !== 'VOICE_SPEAK_FORBIDDEN') {
      sendWs(socket, 'voice:error', { code: r.code }, requestId);
    }
  },

  'voice:server_mute': voiceModeration,
  'voice:kick': voiceModeration,
  'voice:move': voiceModeration,

  'voice:deafen': ({ socket, data, requestId }) => {
    const explicit = typeof data.deafened === 'boolean' ? data.deafened : undefined;
    const r = setVoiceDeafen(socket, explicit);
    if (!r.ok) {
      sendWs(socket, 'voice:error', { code: r.code }, requestId);
    }
  },

  'voice:speaking': ({ socket, data, requestId }) => {
    const speaking = data.speaking === true;
    const r = setVoiceSpeaking(socket, speaking);
    if (!r.ok) {
      sendWs(socket, 'voice:error', { code: r.code }, requestId);
    }
  },

  'voice:signal': async ({ app, socket, data, requestId }) => {
    await handleVoiceMediasoupSignal(socket, app.appEnv, data, requestId);
  },
};

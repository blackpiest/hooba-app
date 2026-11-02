import type { WebSocket } from 'ws';
import { sendWsEnvelope } from '../realtime/ws-envelope.js';
import type { VoiceParticipantInternal, VoiceParticipantPublic } from './voice.types.js';
import { VOICE_ROOM_MAX_USERS } from './voice.types.js';
import { closeVoiceMediaForSocket, notifyVoiceRoomIdle, setVoiceProducerPaused } from './voice-media-bridge.js';

/** channelId → userId → участник */
const rooms = new Map<number, Map<number, VoiceParticipantInternal>>();
const socketVoiceChannel = new Map<WebSocket, number>();
const roomSnapshotListeners = new Set<() => void>();

type VoicePresenceMemory = {
  selfMuted: boolean;
  serverMuted: boolean;
  deafened: boolean;
};

/**
 * Свой mute и deafen при входе в другой канал начинаются заново.
 * Серверная заглушка живёт, пока админ её не снимет: выход, кик, смена канала
 * и повторный вход её не сбрасывают.
 */
const presenceMemory = new Map<number, VoicePresenceMemory>();

function effectiveMuted(p: { selfMuted: boolean; serverMuted: boolean; speakDenied: boolean }): boolean {
  return p.selfMuted || p.serverMuted || p.speakDenied;
}

function rememberPresence(p: VoiceParticipantInternal): void {
  presenceMemory.set(p.userId, {
    selfMuted: p.selfMuted,
    serverMuted: p.serverMuted,
    deafened: p.deafened,
  });
}

function presenceFor(userId: number): VoicePresenceMemory {
  return presenceMemory.get(userId) ?? { selfMuted: false, serverMuted: false, deafened: false };
}

/** Уход из комнаты стирает свой mute. Заглушка админа остаётся до voice:server_mute. */
function trimPresenceAfterDisconnect(userId: number): void {
  const mem = presenceMemory.get(userId);
  if (!mem?.serverMuted) {
    presenceMemory.delete(userId);
    return;
  }
  presenceMemory.set(userId, { selfMuted: false, serverMuted: true, deafened: false });
}

function toPublicFull(p: VoiceParticipantInternal): VoiceParticipantPublic {
  return {
    user_id: p.userId,
    username: p.username,
    muted: effectiveMuted(p),
    server_muted: p.serverMuted,
    speak_denied: p.speakDenied,
    deafened: p.deafened,
    speaking: p.speaking,
    joined_at: new Date(p.joinedAt).toISOString(),
  };
}

function rosterForChannel(channelId: number): VoiceParticipantPublic[] {
  const room = rooms.get(channelId);
  if (!room) return [];
  return [...room.values()].map(toPublicFull);
}

export type VoiceRoomSnapshotParticipant = Pick<
  VoiceParticipantPublic,
  'user_id' | 'username' | 'muted' | 'server_muted' | 'speak_denied' | 'deafened' | 'speaking'
>;

export type VoiceScreenShareSnapshot = {
  user_id: number;
  username: string;
};

export type VoiceRoomSnapshot = {
  channel_id: number;
  participants: VoiceRoomSnapshotParticipant[];
  screen_share: VoiceScreenShareSnapshot | null;
};

/** channelId → единственная демонстрация экрана в комнате. */
const screenShareByChannel = new Map<number, VoiceScreenShareSnapshot>();

export function getVoiceParticipantUsername(channelId: number, userId: number): string | undefined {
  return rooms.get(channelId)?.get(userId)?.username;
}

export function setChannelScreenShare(channelId: number, share: VoiceScreenShareSnapshot | null): void {
  const prev = screenShareByChannel.get(channelId) ?? null;
  const same =
    prev?.user_id === share?.user_id && prev?.username === share?.username && (prev === null) === (share === null);
  if (share) {
    screenShareByChannel.set(channelId, share);
  } else {
    screenShareByChannel.delete(channelId);
  }
  if (!same) {
    notifyVoiceRoomsSnapshotChanged();
  }
}

export function clearAllChannelScreenShares(): void {
  if (screenShareByChannel.size === 0) {
    return;
  }
  screenShareByChannel.clear();
  notifyVoiceRoomsSnapshotChanged();
}

export function getVoiceRoomsSnapshot(): VoiceRoomSnapshot[] {
  const roomsList: VoiceRoomSnapshot[] = [];
  for (const [channelId, room] of rooms) {
    const participants = [...room.values()].map((p) => ({
      user_id: p.userId,
      username: p.username,
      muted: effectiveMuted(p),
      server_muted: p.serverMuted,
      speak_denied: p.speakDenied,
      deafened: p.deafened,
      speaking: p.speaking,
    }));
    roomsList.push({
      channel_id: channelId,
      participants,
      screen_share: screenShareByChannel.get(channelId) ?? null,
    });
  }
  roomsList.sort((a, b) => a.channel_id - b.channel_id);
  return roomsList;
}

function notifyVoiceRoomsSnapshotChanged() {
  for (const l of roomSnapshotListeners) {
    l();
  }
}

export function subscribeVoiceRoomsSnapshotChanged(listener: () => void): () => void {
  roomSnapshotListeners.add(listener);
  return () => roomSnapshotListeners.delete(listener);
}

export function broadcastVoiceRoom(
  channelId: number,
  event: string,
  data: unknown,
  except?: WebSocket,
) {
  const room = rooms.get(channelId);
  if (!room) return;
  const payload = JSON.stringify({ event, data, meta: {} });
  for (const p of room.values()) {
    for (const s of p.sockets) {
      if (s !== except && s.readyState === 1) {
        s.send(payload);
      }
    }
  }
}

export function getSocketVoiceChannelId(socket: WebSocket): number | undefined {
  return socketVoiceChannel.get(socket);
}

export function getVoiceUserIdForSocket(socket: WebSocket): number | undefined {
  const cid = socketVoiceChannel.get(socket);
  if (cid === undefined) return undefined;
  const room = rooms.get(cid);
  if (!room) return undefined;
  for (const [uid, p] of room) {
    if (p.sockets.has(socket)) return uid;
  }
  return undefined;
}

export function isVoiceServerMuted(userId: number): boolean {
  for (const room of rooms.values()) {
    const participant = room.get(userId);
    if (participant) return participant.serverMuted;
  }
  return presenceMemory.get(userId)?.serverMuted ?? false;
}

/** Микрофон обязан молчать на SFU: заглушка админа или запрет роли. */
export function isVoiceMicBlocked(userId: number): boolean {
  for (const room of rooms.values()) {
    const participant = room.get(userId);
    if (participant) return participant.serverMuted || participant.speakDenied;
  }
  return presenceMemory.get(userId)?.serverMuted ?? false;
}

/** Пользователи во всех голосовых комнатах (для пересчёта прав). */
export function listVoiceUsers(): { userId: number; channelId: number }[] {
  const out: { userId: number; channelId: number }[] = [];
  for (const [channelId, room] of rooms) {
    for (const userId of room.keys()) {
      out.push({ userId, channelId });
    }
  }
  return out;
}

/** Убрать сокет из голосовой комнаты без WS-уведомлений. */
function detachVoiceSocket(socket: WebSocket): { channelId: number; userId: number; userRemovedFromChannel: boolean } | null {
  closeVoiceMediaForSocket(socket);
  const channelId = socketVoiceChannel.get(socket);
  if (channelId === undefined) return null;
  const room = rooms.get(channelId);
  if (!room) {
    socketVoiceChannel.delete(socket);
    return null;
  }
  let userId = -1;
  let userRemovedFromChannel = false;
  for (const [uid, p] of room) {
    if (p.sockets.has(socket)) {
      userId = uid;
      p.sockets.delete(socket);
      if (p.sockets.size === 0) {
        rememberPresence(p);
        room.delete(uid);
        userRemovedFromChannel = true;
      }
      break;
    }
  }
  socketVoiceChannel.delete(socket);
  if (room.size === 0) {
    rooms.delete(channelId);
    notifyVoiceRoomIdle(channelId);
  }
  if (userId === -1) return null;
  return { channelId, userId, userRemovedFromChannel };
}

function purgeUserFromAllVoiceRooms(userId: number): number[] {
  const affected: number[] = [];
  for (const [channelId, room] of [...rooms.entries()]) {
    const p = room.get(userId);
    if (!p) continue;
    rememberPresence(p);
    for (const s of p.sockets) {
      closeVoiceMediaForSocket(s);
      socketVoiceChannel.delete(s);
    }
    room.delete(userId);
    affected.push(channelId);
    if (room.size === 0) {
      rooms.delete(channelId);
      notifyVoiceRoomIdle(channelId);
    }
  }
  return affected;
}

function findParticipantByUserId(
  userId: number,
): { channelId: number; room: Map<number, VoiceParticipantInternal>; p: VoiceParticipantInternal } | null {
  for (const [channelId, room] of rooms) {
    const p = room.get(userId);
    if (p) return { channelId, room, p };
  }
  return null;
}

/** Снять с голосового канала всех, кого больше нет в allowlist. */
export function evictVoiceUsersExcept(channelId: number, allowedUserIds: ReadonlySet<number>): void {
  const room = rooms.get(channelId);
  if (!room) return;
  const kicked: { userId: number; sockets: WebSocket[] }[] = [];
  for (const [userId, participant] of [...room.entries()]) {
    if (allowedUserIds.has(userId)) continue;
    const sockets = [...participant.sockets];
    for (const socket of sockets) {
      closeVoiceMediaForSocket(socket);
      socketVoiceChannel.delete(socket);
    }
    room.delete(userId);
    rememberPresence(participant);
    trimPresenceAfterDisconnect(userId);
    kicked.push({ userId, sockets });
  }
  if (kicked.length === 0) return;
  if (room.size === 0) {
    rooms.delete(channelId);
    notifyVoiceRoomIdle(channelId);
  }
  notifyVoiceRoomsSnapshotChanged();
  for (const { userId, sockets } of kicked) {
    broadcastVoiceRoom(channelId, 'voice:user_left', {
      channel_id: channelId,
      user_id: userId,
    });
    for (const socket of sockets) {
      sendWsEnvelope(socket, 'voice:left', { channel_id: channelId, forced: true });
    }
  }
}

/** SFU потерян (упал mediasoup worker): все выходят из голоса с forced, клиенты входят заново. */
export function evictAllVoiceUsers(): void {
  for (const channelId of [...rooms.keys()]) {
    evictVoiceUsersExcept(channelId, new Set());
  }
}

export function leaveVoiceBySocket(socket: WebSocket): { channelId: number; userId: number } | null {
  const detached = detachVoiceSocket(socket);
  if (!detached) return null;
  if (detached.userRemovedFromChannel) {
    trimPresenceAfterDisconnect(detached.userId);
  }
  notifyVoiceRoomsSnapshotChanged();
  if (detached.userRemovedFromChannel) {
    broadcastVoiceRoom(detached.channelId, 'voice:user_left', {
      channel_id: detached.channelId,
      user_id: detached.userId,
    });
  }
  sendWsEnvelope(socket, 'voice:left', { channel_id: detached.channelId });
  return { channelId: detached.channelId, userId: detached.userId };
}

export function canJoinVoiceChannel(channelId: number, userId: number): boolean {
  const room = rooms.get(channelId);
  if (!room) return true;
  if (room.has(userId)) return true;
  return room.size < VOICE_ROOM_MAX_USERS;
}

export type VoiceJoinResult =
  | { ok: true; channelId: number; roster: VoiceParticipantPublic[] }
  | { ok: false; code: string };

export function joinVoiceRoom(params: {
  channelId: number;
  userId: number;
  username: string;
  socket: WebSocket;
  /** Запрет роли на момент входа: участник появляется сразу заглушённым, без мигания. */
  speakDenied?: boolean;
}): VoiceJoinResult {
  const { channelId, userId, username, socket } = params;

  // Уже в этой комнате (перенос или пересборка медиа): слот не отпускаем, SFU закрываем,
  // чтобы клиент поднял новый transport без user_left / user_joined.
  if (socketVoiceChannel.get(socket) === channelId) {
    const room = rooms.get(channelId);
    const self = room ? [...room.values()].find((p) => p.sockets.has(socket)) : undefined;
    if (self && self.userId === userId) {
      closeVoiceMediaForSocket(socket);
      self.username = username;
      return { ok: true, channelId, roster: rosterForChannel(channelId) };
    }
  }

  // Не делаем «уже в этой комнате → сразу ok» для другого канала: клиент мог пересоздать WebRTC,
  // а voice:leave не дошёл — тогда без detach остаётся «зомби» в registry без SFU.
  const detached = detachVoiceSocket(socket);
  let changed = detached !== null;
  const rejoiningSameChannel = detached?.channelId === channelId;
  if (detached?.userRemovedFromChannel && !rejoiningSameChannel) {
    broadcastVoiceRoom(detached.channelId, 'voice:user_left', {
      channel_id: detached.channelId,
      user_id: detached.userId,
    });
  }

  const otherRooms = purgeUserFromAllVoiceRooms(userId);
  if (otherRooms.length > 0) {
    changed = true;
  }
  for (const cid of otherRooms) {
    broadcastVoiceRoom(cid, 'voice:user_left', {
      channel_id: cid,
      user_id: userId,
    });
  }

  let room = rooms.get(channelId);
  if (!room) {
    room = new Map();
    rooms.set(channelId, room);
  }

  const distinctUsers = room.size;
  if (!room.has(userId) && distinctUsers >= VOICE_ROOM_MAX_USERS) {
    return { ok: false, code: 'VOICE_ROOM_FULL' };
  }

  const existing = room.get(userId);
  if (existing) {
    existing.sockets.add(socket);
    existing.username = username;
  } else {
    changed = true;
    const mem = presenceFor(userId);
    const joined: VoiceParticipantInternal = {
      userId,
      username,
      selfMuted: rejoiningSameChannel ? mem.selfMuted : false,
      serverMuted: mem.serverMuted,
      speakDenied: params.speakDenied === true,
      deafened: rejoiningSameChannel ? mem.deafened : false,
      speaking: false,
      joinedAt: Date.now(),
      sockets: new Set([socket]),
    };
    room.set(userId, joined);
    rememberPresence(joined);
  }
  socketVoiceChannel.set(socket, channelId);

  const self = room.get(userId);
  if (!self) {
    return { ok: false, code: 'VOICE_INTERNAL' };
  }

  if (!rejoiningSameChannel) {
    broadcastVoiceRoom(
      channelId,
      'voice:user_joined',
      {
        channel_id: channelId,
        user: toPublicFull(self),
      },
      socket,
    );
  }
  if (changed && !rejoiningSameChannel) {
    notifyVoiceRoomsSnapshotChanged();
  }

  return { ok: true, channelId, roster: rosterForChannel(channelId) };
}

export function leaveVoiceRoom(socket: WebSocket): void {
  leaveVoiceBySocket(socket);
}

export function onVoiceSocketClosed(socket: WebSocket): void {
  const detached = detachVoiceSocket(socket);
  if (!detached?.userRemovedFromChannel) return;
  trimPresenceAfterDisconnect(detached.userId);
  notifyVoiceRoomsSnapshotChanged();
  broadcastVoiceRoom(detached.channelId, 'voice:user_left', {
    channel_id: detached.channelId,
    user_id: detached.userId,
  });
}

type MuteDeafenResult =
  | { ok: true; channelId: number; userId: number; patch: Record<string, boolean> }
  | { ok: false; code: string };

function findParticipantBySocket(
  socket: WebSocket,
): { channelId: number; userId: number; p: VoiceParticipantInternal } | null {
  const channelId = socketVoiceChannel.get(socket);
  if (channelId === undefined) return null;
  const room = rooms.get(channelId);
  if (!room) return null;
  for (const [uid, p] of room) {
    if (p.sockets.has(socket)) {
      return { channelId, userId: uid, p };
    }
  }
  return null;
}

function broadcastUserState(
  channelId: number,
  userId: number,
  patch: Record<string, boolean>,
): void {
  notifyVoiceRoomsSnapshotChanged();
  broadcastVoiceRoom(channelId, 'voice:user_state', {
    channel_id: channelId,
    user_id: userId,
    ...patch,
  });
}

export function setVoiceMute(socket: WebSocket, explicit?: boolean): MuteDeafenResult {
  const found = findParticipantBySocket(socket);
  if (!found) return { ok: false, code: 'VOICE_NOT_CONNECTED' };
  const nextSelf = explicit !== undefined ? explicit : !found.p.selfMuted;
  if (found.p.serverMuted && nextSelf === false) {
    broadcastUserState(found.channelId, found.userId, {
      muted: true,
      server_muted: true,
      speaking: found.p.speaking,
    });
    return { ok: false, code: 'VOICE_SERVER_MUTED' };
  }
  if (found.p.speakDenied && nextSelf === false) {
    broadcastUserState(found.channelId, found.userId, {
      muted: true,
      speak_denied: true,
      speaking: found.p.speaking,
    });
    return { ok: false, code: 'VOICE_SPEAK_FORBIDDEN' };
  }
  found.p.selfMuted = nextSelf;
  const muted = effectiveMuted(found.p);
  const patch: Record<string, boolean> = {
    muted,
    server_muted: found.p.serverMuted,
  };
  if (muted && found.p.speaking) {
    found.p.speaking = false;
    patch.speaking = false;
  }
  rememberPresence(found.p);
  broadcastUserState(found.channelId, found.userId, patch);
  return { ok: true, channelId: found.channelId, userId: found.userId, patch };
}

export function setVoiceDeafen(socket: WebSocket, explicit?: boolean): MuteDeafenResult {
  const found = findParticipantBySocket(socket);
  if (!found) return { ok: false, code: 'VOICE_NOT_CONNECTED' };
  const next = explicit !== undefined ? explicit : !found.p.deafened;
  found.p.deafened = next;
  rememberPresence(found.p);
  const patch = { deafened: next };
  broadcastUserState(found.channelId, found.userId, patch);
  return { ok: true, channelId: found.channelId, userId: found.userId, patch };
}

export function setVoiceSpeaking(socket: WebSocket, speaking: boolean): MuteDeafenResult {
  const found = findParticipantBySocket(socket);
  if (!found) return { ok: false, code: 'VOICE_NOT_CONNECTED' };
  const next = speaking && !effectiveMuted(found.p);
  if (found.p.speaking === next) {
    return { ok: true, channelId: found.channelId, userId: found.userId, patch: { speaking: next } };
  }
  found.p.speaking = next;
  broadcastUserState(found.channelId, found.userId, { speaking: next });
  return { ok: true, channelId: found.channelId, userId: found.userId, patch: { speaking: next } };
}

export type VoiceServerMuteResult =
  | { ok: true; channelId: number; userId: number; paused: boolean }
  | { ok: false; code: string };

export function setVoiceServerMute(userId: number, serverMuted: boolean): VoiceServerMuteResult {
  const found = findParticipantByUserId(userId);
  if (!found) return { ok: false, code: 'VOICE_NOT_CONNECTED' };
  found.p.serverMuted = serverMuted;
  const muted = effectiveMuted(found.p);
  if (muted && found.p.speaking) {
    found.p.speaking = false;
  }
  rememberPresence(found.p);
  for (const socket of found.p.sockets) {
    setVoiceProducerPaused(socket, muted);
  }
  broadcastUserState(found.channelId, userId, {
    muted,
    server_muted: found.p.serverMuted,
    speaking: found.p.speaking,
  });
  return { ok: true, channelId: found.channelId, userId, paused: muted };
}

/** Запрет роли говорить. Producer на SFU встаёт на паузу/возобновляется вместе с эффективным mute. */
export function setVoiceSpeakDenied(userId: number, speakDenied: boolean): boolean {
  const found = findParticipantByUserId(userId);
  if (!found || found.p.speakDenied === speakDenied) return false;
  found.p.speakDenied = speakDenied;
  const muted = effectiveMuted(found.p);
  if (muted && found.p.speaking) {
    found.p.speaking = false;
  }
  for (const socket of found.p.sockets) {
    setVoiceProducerPaused(socket, muted, 'microphone');
  }
  broadcastUserState(found.channelId, userId, {
    muted,
    speak_denied: speakDenied,
    speaking: found.p.speaking,
  });
  return true;
}

export type VoiceKickResult =
  | { ok: true; channelId: number }
  | { ok: false; code: string };

export function kickVoiceUser(userId: number): VoiceKickResult {
  const found = findParticipantByUserId(userId);
  if (!found) return { ok: false, code: 'VOICE_NOT_CONNECTED' };
  const sockets = [...found.p.sockets];
  const channelId = found.channelId;
  for (const socket of sockets) {
    closeVoiceMediaForSocket(socket);
    socketVoiceChannel.delete(socket);
  }
  found.room.delete(userId);
  rememberPresence(found.p);
  trimPresenceAfterDisconnect(userId);
  if (found.room.size === 0) {
    rooms.delete(channelId);
    notifyVoiceRoomIdle(channelId);
  }
  notifyVoiceRoomsSnapshotChanged();
  broadcastVoiceRoom(channelId, 'voice:user_left', {
    channel_id: channelId,
    user_id: userId,
  });
  for (const socket of sockets) {
    sendWsEnvelope(socket, 'voice:left', { channel_id: channelId, forced: true });
  }
  return { ok: true, channelId };
}

export type VoiceMoveResult =
  | { ok: true; fromChannelId: number; channelId: number }
  | { ok: false; code: string };

export function moveVoiceUser(userId: number, targetChannelId: number): VoiceMoveResult {
  const found = findParticipantByUserId(userId);
  if (!found) return { ok: false, code: 'VOICE_NOT_CONNECTED' };
  if (found.channelId === targetChannelId) return { ok: false, code: 'SAME_CHANNEL' };
  if (!canJoinVoiceChannel(targetChannelId, userId)) return { ok: false, code: 'VOICE_ROOM_FULL' };

  rememberPresence(found.p);
  const sockets = [...found.p.sockets];
  const fromChannelId = found.channelId;
  const username = found.p.username;
  for (const socket of sockets) {
    closeVoiceMediaForSocket(socket);
    socketVoiceChannel.delete(socket);
  }
  found.room.delete(userId);
  if (found.room.size === 0) {
    rooms.delete(fromChannelId);
    notifyVoiceRoomIdle(fromChannelId);
  }
  broadcastVoiceRoom(fromChannelId, 'voice:user_left', {
    channel_id: fromChannelId,
    user_id: userId,
  });

  let room = rooms.get(targetChannelId);
  if (!room) {
    room = new Map();
    rooms.set(targetChannelId, room);
  }
  const mem = presenceFor(userId);
  const joined: VoiceParticipantInternal = {
    userId,
    username,
    selfMuted: mem.selfMuted,
    serverMuted: mem.serverMuted,
    speakDenied: found.p.speakDenied,
    deafened: mem.deafened,
    speaking: false,
    joinedAt: Date.now(),
    sockets: new Set(sockets),
  };
  room.set(userId, joined);
  for (const socket of sockets) {
    socketVoiceChannel.set(socket, targetChannelId);
  }
  rememberPresence(joined);
  broadcastVoiceRoom(targetChannelId, 'voice:user_joined', {
    channel_id: targetChannelId,
    user: toPublicFull(joined),
  });
  notifyVoiceRoomsSnapshotChanged();
  for (const socket of sockets) {
    sendWsEnvelope(socket, 'voice:moved', { channel_id: targetChannelId });
  }
  return { ok: true, fromChannelId, channelId: targetChannelId };
}

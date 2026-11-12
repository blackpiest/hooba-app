import type { WebSocket } from 'ws';
import { prisma } from '../../core/database/prisma.js';
import { readDbId } from '../../core/http/params.js';
import type { PresenceSession } from '../../core/presence/presence-registry.js';
import { channelAudienceSelect, privateAudienceOf } from '../../core/permissions/channel-visibility.js';
import { sendWsEnvelope } from './ws-envelope.js';

export type AuthedMeta = {
  phase: 'authed';
  userId: number;
  username: string;
  joinedChannelId: number | null;
  sessionId: number;
  sessionVersion: number;
  accessExpMs: number;
};

export type ClientMeta = { phase: 'guest' } | AuthedMeta;

export const channelSockets = new Map<number, Set<WebSocket>>();
export const socketMeta = new Map<WebSocket, ClientMeta>();
export const socketOpenedAt = new Map<WebSocket, number>();
/** Сокет уже прошёл проверку лимита, но ещё не записан как authed. */
export const identifyingUsers = new Map<WebSocket, number>();
export const identifiedSockets = new Set<WebSocket>();
export const socketActivity = new Map<WebSocket, number>();
export const presenceTokens = new WeakMap<WebSocket, PresenceSession>();
/** userId → его authed-сокеты. Ведётся вместе с socketMeta через setSocketMeta / forgetSocketMeta. */
const userSockets = new Map<number, Set<WebSocket>>();

const socketEventBuckets = new Map<WebSocket, number[]>();
const socketEventWindowMs = 10_000;
const socketEventMax = 80;

function unindexUserSocket(socket: WebSocket): void {
  const meta = socketMeta.get(socket);
  if (meta?.phase !== 'authed') return;
  const set = userSockets.get(meta.userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) userSockets.delete(meta.userId);
}

export function setSocketMeta(socket: WebSocket, meta: ClientMeta): void {
  unindexUserSocket(socket);
  socketMeta.set(socket, meta);
  if (meta.phase !== 'authed') return;
  let set = userSockets.get(meta.userId);
  if (!set) {
    set = new Set();
    userSockets.set(meta.userId, set);
  }
  set.add(socket);
}

export function forgetSocketMeta(socket: WebSocket): void {
  unindexUserSocket(socket);
  socketMeta.delete(socket);
}

export function forgetSocketEventBucket(socket: WebSocket): void {
  socketEventBuckets.delete(socket);
}

export function sendWs(socket: WebSocket, event: string, data: unknown, requestId?: string) {
  sendWsEnvelope(socket, event, data, requestId);
}

export function sendError(socket: WebSocket, code: string, requestId?: string) {
  sendWs(socket, 'error', { code, message: code }, requestId);
}

export function sendAuthError(socket: WebSocket, code: string, requestId?: string) {
  sendWs(socket, 'auth:error', { code, message: code }, requestId);
}

/** id из полей WS: целое, допустимое для PostgreSQL integer, иначе null. */
export function readFiniteId(value: unknown): number | null {
  return readDbId(value);
}

export function touchSocketActivity(socket: WebSocket) {
  socketActivity.set(socket, Date.now());
}

export function allowSocketEvent(socket: WebSocket): boolean {
  const now = Date.now();
  const fresh = (socketEventBuckets.get(socket) ?? []).filter((stamp) => now - stamp < socketEventWindowMs);
  if (fresh.length >= socketEventMax) {
    socketEventBuckets.set(socket, fresh);
    return false;
  }
  fresh.push(now);
  socketEventBuckets.set(socket, fresh);
  return true;
}

export function subscribeChannel(channelId: number, socket: WebSocket) {
  let set = channelSockets.get(channelId);
  if (!set) {
    set = new Set();
    channelSockets.set(channelId, set);
  }
  set.add(socket);
}

export function unsubscribeChannel(channelId: number, socket: WebSocket) {
  const set = channelSockets.get(channelId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) channelSockets.delete(channelId);
}

export function leaveJoinedChannel(socket: WebSocket, meta: ClientMeta) {
  if (meta.phase === 'authed' && meta.joinedChannelId !== null) {
    unsubscribeChannel(meta.joinedChannelId, socket);
    meta.joinedChannelId = null;
  }
}

export function dropChannelSubscribers(channelId: number, shouldDrop: (userId: number) => boolean): void {
  const set = channelSockets.get(channelId);
  if (!set) return;
  for (const socket of [...set]) {
    const meta = socketMeta.get(socket);
    if (meta?.phase !== 'authed' || !shouldDrop(meta.userId)) continue;
    unsubscribeChannel(channelId, socket);
    if (meta.joinedChannelId === channelId) {
      meta.joinedChannelId = null;
    }
  }
}

export async function liveChannelAudience(channelId: number): Promise<Set<WebSocket>> {
  const set = channelSockets.get(channelId);
  if (!set || set.size === 0) {
    return new Set();
  }
  const channel = await prisma.channel.findFirst({
    where: { id: channelId },
    select: { isDeleted: true, ...channelAudienceSelect },
  });
  if (!channel || channel.isDeleted) {
    dropChannelSubscribers(channelId, () => true);
    return new Set();
  }
  const members = privateAudienceOf(channel);
  if (members === null) {
    return new Set(set);
  }
  dropChannelSubscribers(channelId, (userId) => !members.has(userId));
  const remaining = channelSockets.get(channelId);
  return remaining ? new Set(remaining) : new Set();
}

export async function broadcastChannelEvent(channelId: number, event: string, data: unknown): Promise<void> {
  const audience = await liveChannelAudience(channelId);
  const payload = JSON.stringify({ event, data, meta: {} });
  for (const socket of audience) {
    if (socket.readyState === 1) {
      socket.send(payload);
    }
  }
}

export async function broadcastChannelExcept(
  channelId: number,
  event: string,
  data: unknown,
  except: WebSocket,
): Promise<void> {
  const audience = await liveChannelAudience(channelId);
  const payload = JSON.stringify({ event, data, meta: {} });
  for (const socket of audience) {
    if (socket !== except && socket.readyState === 1) {
      socket.send(payload);
    }
  }
}

/** Всем прошедшим auth:identify сокетам. */
export function broadcastAll(event: string, data: unknown) {
  const payload = JSON.stringify({ event, data, meta: {} });
  for (const s of identifiedSockets) {
    if (s.readyState === 1) {
      s.send(payload);
    }
  }
}

export function countAuthedSockets(userId: number, except: WebSocket): number {
  let count = 0;
  for (const socket of userSockets.get(userId) ?? []) {
    if (socket !== except) count += 1;
  }
  for (const [socket, pendingUserId] of identifyingUsers) {
    if (socket !== except && pendingUserId === userId) count += 1;
  }
  return count;
}

export function forEachAuthedUserSocket(userId: number, fn: (socket: WebSocket) => void) {
  for (const socket of [...(userSockets.get(userId) ?? [])]) {
    fn(socket);
  }
}

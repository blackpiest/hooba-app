import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { verifyAccessToken } from '../../core/auth/tokens.js';
import { assertCommunitySession } from '../../core/auth/member-session.js';
import { assertRefreshSessionActive, assertRefreshSessionBound } from '../../core/auth/refresh-session.js';
import { systemRoleKeysOf } from '../../core/auth/roles.js';
import { AppError } from '../../core/errors/app-error.js';
import { prisma } from '../../core/database/prisma.js';
import {
  forcePresenceOffline,
  registerPresenceSession,
  unregisterPresenceSession,
} from '../../core/presence/presence-registry.js';
import { presenceFromDb } from '../../core/presence/resolve-public-status.js';
import { channelVisibleWhere } from '../../core/permissions/channel-visibility.js';
import { onVoiceSocketClosed } from '../voice/voice-registry.js';
import { serverIconUrl } from '../server-icon/server-icon-storage.js';
import { acceptsAnotherSocket, isGuestTimedOut } from './socket-policy.js';
import {
  countAuthedSockets,
  forEachAuthedUserSocket,
  forgetSocketEventBucket,
  forgetSocketMeta,
  identifiedSockets,
  identifyingUsers,
  presenceTokens,
  sendAuthError,
  sendWs,
  setSocketMeta,
  socketActivity,
  socketMeta,
  socketOpenedAt,
  touchSocketActivity,
  unsubscribeChannel,
} from './ws-registry.js';
import { emitPublicGame, emitPublicStatus, writeLastSeen } from './handlers/presence.js';
import { emitVoiceRoomsSnapshot } from './handlers/voice.js';

const MAX_IDENTIFY_ATTEMPTS = 15;
/** Неудачные auth:identify подряд. Успех обнуляет: re-identify приходит после каждого refresh. */
const identifyAttempts = new WeakMap<WebSocket, number>();

export async function handleIdentify(
  app: FastifyInstance,
  socket: WebSocket,
  data: Record<string, unknown>,
  requestId: string | undefined,
): Promise<void> {
  const attempts = (identifyAttempts.get(socket) ?? 0) + 1;
  identifyAttempts.set(socket, attempts);
  if (attempts > MAX_IDENTIFY_ATTEMPTS) {
    socket.close();
    return;
  }
  const token =
    typeof data.accessToken === 'string'
      ? data.accessToken
      : typeof data.token === 'string'
        ? data.token
        : '';
  if (!token) {
    sendAuthError(socket, 'UNAUTHORIZED', requestId);
    return;
  }
  try {
    const claims = await verifyAccessToken(app.appEnv, token);
    await assertCommunitySession(claims.userId, claims.sessionVersion);
    await assertRefreshSessionActive(claims.sessionId);
    const { userId, username } = claims;
    const already = socketMeta.get(socket);
    if (already?.phase === 'authed') {
      if (already.userId !== userId) {
        sendAuthError(socket, 'UNAUTHORIZED', requestId);
        socket.close();
        return;
      }
      already.username = username;
      already.sessionId = claims.sessionId;
      already.sessionVersion = claims.sessionVersion;
      already.accessExpMs = claims.expiresAtMs;
      // Считаем только неудачи: успешный re-identify приходит после каждого refresh (~раз в 14 мин).
      identifyAttempts.set(socket, 0);
      sendWs(
        socket,
        'auth:success',
        {
          user: { id: userId, username },
          server: null,
          roles: [],
          channels: [],
        },
        requestId,
      );
      sendWs(socket, 'state:ready', { joined_channel_id: already.joinedChannelId }, requestId);
      return;
    }
    if (!acceptsAnotherSocket(countAuthedSockets(userId, socket))) {
      sendAuthError(socket, 'TOO_MANY_CONNECTIONS', requestId);
      socket.close();
      return;
    }
    identifyingUsers.set(socket, userId);
    setSocketMeta(socket, {
      phase: 'authed',
      userId,
      username,
      joinedChannelId: null,
      sessionId: claims.sessionId,
      sessionVersion: claims.sessionVersion,
      accessExpMs: claims.expiresAtMs,
    });
    identifyAttempts.set(socket, 0);
    identifyingUsers.delete(socket);
    identifiedSockets.add(socket);
    touchSocketActivity(socket);
    const [settings, roles, channels, account] = await Promise.all([
      prisma.serverSettings.findUnique({ where: { id: 1 } }),
      prisma.userRole.findMany({
        where: { userId },
        select: { role: { select: { key: true } } },
      }),
      prisma.channel.findMany({
        where: {
          isDeleted: false,
          ...channelVisibleWhere(userId),
        },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, channelType: true, isPrivate: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { presencePreference: true },
      }),
    ]);
    const preference = presenceFromDb(account?.presencePreference ?? 'ONLINE');
    const transition = registerPresenceSession(userId, preference);
    presenceTokens.set(socket, transition.token);
    emitPublicStatus(userId, transition.previous, transition.next);
    sendWs(socket, 'presence:preference', { status: preference });
    sendWs(
      socket,
      'auth:success',
      {
        user: { id: userId, username },
        server: settings
          ? {
              server_name: settings.serverName,
              server_icon_url: serverIconUrl(settings.iconKey),
              registration_mode: settings.registrationMode,
            }
          : null,
        roles: systemRoleKeysOf(roles),
        channels: channels.map((ch) => ({
          id: ch.id,
          name: ch.name,
          channel_type: ch.channelType,
          is_private: ch.isPrivate,
        })),
      },
      requestId,
    );
    sendWs(socket, 'state:ready', { joined_channel_id: null }, requestId);
    emitVoiceRoomsSnapshot(app, socket, userId);
  } catch (err: unknown) {
    identifyingUsers.delete(socket);
    if (!presenceTokens.has(socket)) {
      identifiedSockets.delete(socket);
      setSocketMeta(socket, { phase: 'guest' });
    }
    const code = err instanceof AppError ? err.code : 'UNAUTHORIZED';
    sendAuthError(socket, code, requestId);
  }
}

export function forceLogoutUser(app: FastifyInstance, userId: number, code: string) {
  const drop = forcePresenceOffline(userId);
  emitPublicStatus(userId, drop.previous, 'offline');
  emitPublicGame(userId, drop.gamePrevious, null);
  if (drop.updateLastSeen) {
    writeLastSeen(app, userId);
  }
  forEachAuthedUserSocket(userId, (socket) => {
    presenceTokens.delete(socket);
    sendWs(socket, 'auth:force_logout', { code, message: code });
    socket.close();
  });
}

export function handleSocketClose(socket: WebSocket) {
  onVoiceSocketClosed(socket);
  const m = socketMeta.get(socket);
  identifiedSockets.delete(socket);
  socketActivity.delete(socket);
  forgetSocketEventBucket(socket);
  socketOpenedAt.delete(socket);
  identifyingUsers.delete(socket);

  if (m?.phase === 'authed') {
    if (m.joinedChannelId !== null) {
      unsubscribeChannel(m.joinedChannelId, socket);
    }
    const token = presenceTokens.get(socket);
    if (token) {
      presenceTokens.delete(socket);
      const change = unregisterPresenceSession(token);
      if (change) {
        emitPublicStatus(change.userId, change.previous, change.next);
        emitPublicGame(change.userId, change.gamePrevious, change.gameNext);
      }
    }
  }
  forgetSocketMeta(socket);
}

/** Протокольный ping ждёт pong. Два пропуска подряд — сокет мёртвый. */
const socketAwaitingPong = new WeakMap<WebSocket, boolean>();
const socketMissedPongs = new WeakMap<WebSocket, number>();

let staleSweepTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let guestSweepTimer: ReturnType<typeof setInterval> | null = null;
let sessionSweepTimer: ReturnType<typeof setInterval> | null = null;

const PONG_INTERVAL_MS = 30_000;
const PONG_MISS_LIMIT = 2;

export function noteSocketPong(socket: WebSocket) {
  socketAwaitingPong.set(socket, false);
  socketMissedPongs.set(socket, 0);
}

function terminateDeadSocket(app: FastifyInstance, socket: WebSocket, reason: string) {
  app.log.warn(`terminating ws: ${reason}`);
  socket.terminate();
}

async function revalidateAuthedSockets(app: FastifyInstance): Promise<void> {
  for (const [socket, meta] of [...socketMeta]) {
    if (meta.phase !== 'authed' || socket.readyState !== 1) continue;
    if (Date.now() >= meta.accessExpMs) {
      sendWs(socket, 'auth:expired', { code: 'ACCESS_EXPIRED' });
      socket.close();
      continue;
    }
    try {
      await assertCommunitySession(meta.userId, meta.sessionVersion);
      await assertRefreshSessionBound(meta.sessionId);
    } catch (err: unknown) {
      const code = err instanceof AppError ? err.code : 'SESSION_REVOKED';
      sendWs(socket, 'auth:revoked', { code });
      socket.close();
      app.log.warn({ err, userId: meta.userId }, 'ws session revoked');
    }
  }
}

export function ensureStaleActivitySweep(app: FastifyInstance) {
  if (staleSweepTimer || heartbeatTimer || guestSweepTimer || sessionSweepTimer) {
    return;
  }
  staleSweepTimer = setInterval(() => {
    const now = Date.now();
    const maxIdleMs = 120_000;
    for (const s of [...socketActivity.keys()]) {
      const t = socketActivity.get(s) ?? 0;
      if (now - t > maxIdleMs) {
        terminateDeadSocket(app, s, 'stale activity');
      }
    }
  }, 45_000);
  staleSweepTimer.unref();
  heartbeatTimer = setInterval(() => {
    for (const s of [...socketActivity.keys()]) {
      if (s.readyState !== 1) {
        terminateDeadSocket(app, s, 'not open');
        continue;
      }
      if (socketAwaitingPong.get(s) === true) {
        const missed = (socketMissedPongs.get(s) ?? 0) + 1;
        socketMissedPongs.set(s, missed);
        if (missed >= PONG_MISS_LIMIT) {
          terminateDeadSocket(app, s, 'missed pong');
          continue;
        }
      }
      socketAwaitingPong.set(s, true);
      try {
        s.ping();
      } catch (err: unknown) {
        app.log.warn({ err }, 'ws ping failed');
        terminateDeadSocket(app, s, 'ping failed');
      }
    }
  }, PONG_INTERVAL_MS);
  heartbeatTimer.unref();
  guestSweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [socket, openedAt] of [...socketOpenedAt]) {
      const meta = socketMeta.get(socket);
      if (!meta || meta.phase !== 'guest') continue;
      if (isGuestTimedOut(openedAt, now)) {
        terminateDeadSocket(app, socket, 'guest identify timeout');
      }
    }
  }, 2_000);
  guestSweepTimer.unref();
  sessionSweepTimer = setInterval(() => {
    void revalidateAuthedSockets(app).catch((err: unknown) => {
      app.log.error({ err }, 'ws session revalidate');
    });
  }, 30_000);
  sessionSweepTimer.unref();
}

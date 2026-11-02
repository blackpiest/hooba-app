import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../core/database/prisma.js';
import { consumeRateLimit } from '../../../core/http/rate-limit.js';
import {
  setSessionAfk,
  setSessionGame,
  type PublicPresenceStatus,
} from '../../../core/presence/presence-registry.js';
import { broadcastAll, presenceTokens } from '../ws-registry.js';
import type { WsHandlers } from './types.js';

export function emitPublicStatus(userId: number, previous: PublicPresenceStatus, next: PublicPresenceStatus) {
  if (previous === next) {
    return;
  }
  broadcastAll('presence:user_status', { user_id: userId, status: next });
}

export function emitPublicGame(userId: number, previous: string | null, next: string | null) {
  if (previous === next) {
    return;
  }
  broadcastAll('presence:activity', { user_id: userId, game: next });
}

export function writeLastSeen(app: FastifyInstance, userId: number) {
  void prisma.user
    .update({
      where: { id: userId },
      data: { lastSeen: new Date() },
    })
    .catch((err: unknown) => {
      app.log.error({ err }, 'presence lastSeen update');
    });
}

const GAME_TITLE_MAX = 80;

function parseActivityGame(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  // Управляющие символы из названия игры вырезаются намеренно.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) {
    return null;
  }
  if (cleaned.length > GAME_TITLE_MAX) {
    return undefined;
  }
  return cleaned;
}

export const presenceHandlers: WsHandlers = {
  'presence:set_afk': ({ socket, meta, data }) => {
    const token = presenceTokens.get(socket);
    if (!token || typeof data.afk !== 'boolean') {
      return;
    }
    // Каждое изменение уходит всем клиентам: сверх лимита молча игнорируем.
    if (!consumeRateLimit(`ws-presence:${meta.userId}`, 10, 10_000)) {
      return;
    }
    const change = setSessionAfk(token, data.afk);
    if (change) {
      emitPublicStatus(change.userId, change.previous, change.next);
    }
  },

  'presence:set_activity': ({ socket, meta, data }) => {
    const token = presenceTokens.get(socket);
    if (!token || !('game' in data)) {
      return;
    }
    const game = parseActivityGame(data.game);
    if (game === undefined) {
      return;
    }
    if (!consumeRateLimit(`ws-presence:${meta.userId}`, 10, 10_000)) {
      return;
    }
    const change = setSessionGame(token, game);
    if (change) {
      emitPublicGame(change.userId, change.previous, change.next);
    }
  },
};

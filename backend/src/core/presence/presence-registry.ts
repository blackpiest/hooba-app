/**
 * In-memory sessions. Public status is preference plus liveness (`PRESENCE_MODEL_V1`).
 * A dropped last session stays published for OFFLINE_GRACE_MS so a reload does not flash offline.
 */

import {
  resolvePublicStatus,
  type PresencePreference,
  type PublicPresenceStatus,
} from './resolve-public-status.js';

export type { PresencePreference, PublicPresenceStatus } from './resolve-public-status.js';

export const OFFLINE_GRACE_MS = 10_000;

export type PresenceSession = object;

type SessionState = {
  afk: boolean;
  game: string | null;
  gameAt: number;
};

type UserRuntime = {
  preference: PresencePreference;
  sessions: Map<PresenceSession, SessionState>;
  published: PublicPresenceStatus;
  offlineTimer: ReturnType<typeof setTimeout> | null;
  pendingLastSeen: boolean;
};

let gameStamp = 0;

function nextGameStamp(): number {
  gameStamp += 1;
  return gameStamp;
}

const users = new Map<number, UserRuntime>();
const sessionOwner = new Map<PresenceSession, number>();

type GraceListener = (userId: number, updateLastSeen: boolean) => void;
let graceListener: GraceListener | null = null;

export function onPresenceGraceExpired(listener: GraceListener): void {
  graceListener = listener;
}

function recompute(row: UserRuntime): PublicPresenceStatus {
  if (row.sessions.size === 0) {
    return 'offline';
  }
  let allAfk = true;
  for (const session of row.sessions.values()) {
    if (!session.afk) {
      allAfk = false;
      break;
    }
  }
  return resolvePublicStatus(row.sessions.size, row.preference, allAfk);
}

/** Пользователи, о которых знает реестр (есть сессия или идёт грейс). Статус каждого — `publicStatusOf`. */
export function listPresenceUserIds(): number[] {
  return [...users.keys()];
}

export function publicStatusOf(userId: number): PublicPresenceStatus {
  return users.get(userId)?.published ?? 'offline';
}

/** Название игры, которое видят остальные. Невидимка и отсутствие сессий — null. */
export function publicGameOf(userId: number): string | null {
  const row = users.get(userId);
  if (!row) {
    return null;
  }
  return visibleGame(row);
}

function visibleGame(row: UserRuntime): string | null {
  if (row.sessions.size === 0 || recompute(row) === 'offline') {
    return null;
  }
  let best: { game: string; at: number } | null = null;
  for (const session of row.sessions.values()) {
    if (!session.game) {
      continue;
    }
    if (!best || session.gameAt >= best.at) {
      best = { game: session.game, at: session.gameAt };
    }
  }
  return best?.game ?? null;
}

export function registerPresenceSession(
  userId: number,
  preference: PresencePreference,
): { token: PresenceSession; previous: PublicPresenceStatus; next: PublicPresenceStatus } {
  let row = users.get(userId);
  if (!row) {
    row = {
      preference,
      sessions: new Map(),
      published: 'offline',
      offlineTimer: null,
      pendingLastSeen: false,
    };
    users.set(userId, row);
  }
  row.preference = preference;
  if (row.offlineTimer) {
    clearTimeout(row.offlineTimer);
    row.offlineTimer = null;
    row.pendingLastSeen = false;
  }
  const token: PresenceSession = {};
  row.sessions.set(token, { afk: false, game: null, gameAt: 0 });
  sessionOwner.set(token, userId);
  const previous = row.published;
  const next = recompute(row);
  row.published = next;
  return { token, previous, next };
}

export function unregisterPresenceSession(token: PresenceSession): {
  userId: number;
  previous: PublicPresenceStatus;
  next: PublicPresenceStatus;
  gamePrevious: string | null;
  gameNext: string | null;
} | null {
  const userId = sessionOwner.get(token);
  if (userId === undefined) {
    return null;
  }
  sessionOwner.delete(token);
  const row = users.get(userId);
  if (!row) {
    return null;
  }
  const gamePrevious = visibleGame(row);
  row.sessions.delete(token);
  const previous = row.published;
  if (row.sessions.size > 0) {
    const next = recompute(row);
    row.published = next;
    return { userId, previous, next, gamePrevious, gameNext: visibleGame(row) };
  }
  if (row.preference === 'invisible') {
    row.published = 'offline';
    users.delete(userId);
    return { userId, previous, next: 'offline', gamePrevious, gameNext: null };
  }
  row.pendingLastSeen = true;
  if (row.offlineTimer) {
    clearTimeout(row.offlineTimer);
  }
  row.offlineTimer = setTimeout(() => {
    expireOffline(userId);
  }, OFFLINE_GRACE_MS);
  return { userId, previous, next: previous, gamePrevious, gameNext: null };
}

function expireOffline(userId: number): void {
  const row = users.get(userId);
  if (!row || row.sessions.size > 0) {
    return;
  }
  row.offlineTimer = null;
  const updateLastSeen = row.pendingLastSeen && row.preference !== 'invisible';
  users.delete(userId);
  graceListener?.(userId, updateLastSeen);
}

export function setSessionAfk(
  token: PresenceSession,
  afk: boolean,
): { userId: number; previous: PublicPresenceStatus; next: PublicPresenceStatus } | null {
  const userId = sessionOwner.get(token);
  if (userId === undefined) {
    return null;
  }
  const row = users.get(userId);
  const session = row?.sessions.get(token);
  if (!row || !session) {
    return null;
  }
  if (session.afk === afk) {
    return { userId, previous: row.published, next: row.published };
  }
  session.afk = afk;
  const previous = row.published;
  const next = recompute(row);
  row.published = next;
  return { userId, previous, next };
}

export function setSessionGame(
  token: PresenceSession,
  game: string | null,
): { userId: number; previous: string | null; next: string | null } | null {
  const userId = sessionOwner.get(token);
  if (userId === undefined) {
    return null;
  }
  const row = users.get(userId);
  const session = row?.sessions.get(token);
  if (!row || !session) {
    return null;
  }
  const previous = visibleGame(row);
  const nextGame = game?.trim() ? game.trim() : null;
  if (nextGame) {
    session.game = nextGame;
    session.gameAt = nextGameStamp();
  } else {
    session.game = null;
  }
  return { userId, previous, next: visibleGame(row) };
}

export function applyPresencePreference(
  userId: number,
  preference: PresencePreference,
): { previous: PublicPresenceStatus; next: PublicPresenceStatus } {
  const row = users.get(userId);
  if (!row) {
    return { previous: 'offline', next: 'offline' };
  }
  row.preference = preference;
  if (row.sessions.size === 0) {
    if (preference === 'invisible' && row.offlineTimer) {
      clearTimeout(row.offlineTimer);
      row.offlineTimer = null;
      row.pendingLastSeen = false;
      const previous = row.published;
      users.delete(userId);
      return { previous, next: 'offline' };
    }
    return { previous: row.published, next: row.published };
  }
  const previous = row.published;
  const next = recompute(row);
  row.published = next;
  return { previous, next };
}

/** Kick/ban: drop sessions immediately, skip the reconnect grace. */
export function forcePresenceOffline(userId: number): {
  previous: PublicPresenceStatus;
  updateLastSeen: boolean;
  gamePrevious: string | null;
} {
  const row = users.get(userId);
  if (!row) {
    return { previous: 'offline', updateLastSeen: false, gamePrevious: null };
  }
  const gamePrevious = visibleGame(row);
  if (row.offlineTimer) {
    clearTimeout(row.offlineTimer);
  }
  for (const token of row.sessions.keys()) {
    sessionOwner.delete(token);
  }
  const previous = row.published;
  const updateLastSeen = previous !== 'offline' && row.preference !== 'invisible';
  users.delete(userId);
  return { previous, updateLastSeen, gamePrevious };
}

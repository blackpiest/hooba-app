import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, RefreshRevokeReason } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { AppError } from '../errors/app-error.js';

export function generateRefreshRawAndHash(): { raw: string; tokenHash: string } {
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  return { raw, tokenHash };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function createRefreshSession(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<number> {
  const row = await prisma.refreshSession.create({
    data: { userId, tokenHash, expiresAt },
    select: { id: true },
  });
  return row.id;
}

export async function assertRefreshSessionActive(sessionId: number): Promise<void> {
  const row = await loadRefreshSession(sessionId);
  if (!row || row.revokedAt || row.expiresAt <= new Date()) {
    throw new AppError('SESSION_REVOKED', 401, 'Session is no longer valid');
  }
}

/** Сокет ещё можно держать: сессия жива либо её только что сменила ротация refresh. */
export async function assertRefreshSessionBound(sessionId: number): Promise<void> {
  const row = await loadRefreshSession(sessionId);
  if (!row || row.expiresAt <= new Date()) {
    throw new AppError('SESSION_REVOKED', 401, 'Session is no longer valid');
  }
  if (!row.revokedAt) {
    return;
  }
  if (Date.now() - row.revokedAt.getTime() <= REFRESH_ROTATION_SOCKET_GRACE_MS) {
    return;
  }
  throw new AppError('SESSION_REVOKED', 401, 'Session is no longer valid');
}

async function loadRefreshSession(
  sessionId: number,
): Promise<{ revokedAt: Date | null; expiresAt: Date } | null> {
  return prisma.refreshSession.findUnique({
    where: { id: sessionId },
    select: { revokedAt: true, expiresAt: true },
  });
}

/** Повтор того же refresh в этом окне — гонка вкладок, а не кража. Сессию семьи не гасим. */
export const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * Ротация отзывает старый sid до того, как клиент пришлёт `auth:identify` с новым.
 * Проверка живого сокета в этом окне не считает отзыв выходом.
 */
export const REFRESH_ROTATION_SOCKET_GRACE_MS = 20_000;

export type RotatedRefreshSession = {
  userId: number;
  username: string;
  sessionVersion: number;
  isActive: boolean;
  kickedAt: Date | null;
  previousSessionId: number;
  sessionId: number;
  refreshRaw: string;
};

/**
 * Атомарно отзывает предъявленный refresh и создаёт новый.
 * `reuse` — отозванный секрет принесли после grace: остальные сессии пользователя нужно закрыть.
 */
export async function rotateRefreshSession(
  raw: string,
  expiresAt: Date,
): Promise<{ kind: 'rotated'; session: RotatedRefreshSession } | { kind: 'reuse'; userId: number } | { kind: 'invalid' }> {
  const tokenHash = hashRefreshToken(raw);
  const now = new Date();
  const rotated = await prisma.$transaction(async (tx) => {
    const row = await tx.refreshSession.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: { user: true },
    });
    if (!row) {
      return null;
    }
    const revoked = await tx.refreshSession.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'ROTATED' },
    });
    if (revoked.count !== 1) {
      return null;
    }
    const next = generateRefreshRawAndHash();
    const created = await tx.refreshSession.create({
      data: { userId: row.userId, tokenHash: next.tokenHash, expiresAt },
      select: { id: true },
    });
    return {
      userId: row.userId,
      username: row.user.username,
      sessionVersion: row.user.sessionVersion,
      isActive: row.user.isActive,
      kickedAt: row.user.kickedAt,
      previousSessionId: row.id,
      sessionId: created.id,
      refreshRaw: next.raw,
    } satisfies RotatedRefreshSession;
  });
  if (rotated) {
    return { kind: 'rotated', session: rotated };
  }

  const previous = await prisma.refreshSession.findFirst({
    where: { tokenHash },
    select: { userId: true, revokedAt: true, revokeReason: true },
  });
  if (!previous?.revokedAt || previous.revokeReason !== 'ROTATED') {
    return { kind: 'invalid' };
  }
  if (Date.now() - previous.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS) {
    return { kind: 'invalid' };
  }
  return { kind: 'reuse', userId: previous.userId };
}

export async function findActiveSessionByRefreshRaw(raw: string) {
  const tokenHash = hashRefreshToken(raw);
  return prisma.refreshSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
}

export async function revokeRefreshSessionById(
  id: number,
  reason: RefreshRevokeReason,
): Promise<void> {
  await prisma.refreshSession.update({
    where: { id },
    data: { revokedAt: new Date(), revokeReason: reason },
  });
}

export async function purgeExpiredRefreshSessions(now = new Date()): Promise<number> {
  const result = await prisma.refreshSession.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}

export async function revokeAllRefreshSessionsForUser(
  userId: number,
  db: Pick<Prisma.TransactionClient, 'refreshSession'> = prisma,
): Promise<void> {
  await db.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: 'FORCED' },
  });
}

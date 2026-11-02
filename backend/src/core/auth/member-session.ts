import { prisma } from '../database/prisma.js';
import { AppError } from '../errors/app-error.js';

async function accountDisabledMessage(userId: number): Promise<string> {
  const lastBan = await prisma.moderationLog.findFirst({
    where: { targetUserId: userId, action: 'BAN' },
    orderBy: { createdAt: 'desc' },
    select: { reason: true },
  });
  const reason = lastBan?.reason?.trim();
  if (reason) {
    return `Account is disabled: ${reason}`;
  }
  return 'Account is disabled';
}

export async function accountDisabledError(userId: number): Promise<AppError> {
  return new AppError('ACCOUNT_DISABLED', 403, await accountDisabledMessage(userId));
}

/** Rejects banned, kicked, and access tokens issued before kick/ban. */
export async function assertCommunitySession(userId: number, sessionVersion: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, kickedAt: true, sessionVersion: true },
  });
  if (!user) {
    throw new AppError('UNAUTHORIZED', 401, 'User not found');
  }
  if (!user.isActive) {
    throw await accountDisabledError(userId);
  }
  if (user.kickedAt) {
    throw new AppError(
      'KICKED',
      403,
      'Removed from the community. Rejoin with a new invite.',
    );
  }
  if (user.sessionVersion !== sessionVersion) {
    throw new AppError('SESSION_REVOKED', 401, 'Session is no longer valid');
  }
}

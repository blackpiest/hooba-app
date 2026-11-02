import type { ModerationAction, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { revokeAllRefreshSessionsForUser } from '../../core/auth/refresh-session.js';
import { userSystemRoleKeys } from '../../core/auth/roles.js';
import { invalidateChannelRules, invalidateRolePermissions } from '../../core/permissions/permissions.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';

export async function assertModerationAllowed(actorId: number, targetId: number) {
  if (actorId === targetId) {
    throw new AppError('VALIDATION_ERROR', 400, 'Cannot target yourself');
  }
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new AppError('NOT_FOUND', 404, 'User not found');
  }
  const actorRoles = await userSystemRoleKeys(actorId);
  const targetRoles = await userSystemRoleKeys(targetId);
  if ((targetRoles.has('OWNER') || targetRoles.has('ADMIN')) && !actorRoles.has('OWNER')) {
    throw new AppError('FORBIDDEN', 403, 'Only owner can moderate an owner or an admin');
  }
  return target;
}

async function assertNotSoleOwner(targetId: number): Promise<void> {
  const targetRoles = await userSystemRoleKeys(targetId);
  if (!targetRoles.has('OWNER')) {
    return;
  }
  const ownerAssignments = await prisma.userRole.count({
    where: { role: { key: 'OWNER' } },
  });
  if (ownerAssignments <= 1) {
    throw new AppError('VALIDATION_ERROR', 400, 'Cannot remove the only server owner');
  }
}

async function writeLog(
  actorId: number,
  targetUserId: number,
  action: ModerationAction,
  reason: string | null,
  channelId: number | null,
  db: Pick<Prisma.TransactionClient, 'moderationLog'> = prisma,
): Promise<void> {
  await db.moderationLog.create({
    data: { actorId, targetUserId, action, reason, channelId },
  });
}

export async function banUser(actorId: number, targetId: number, reason: string | null): Promise<void> {
  const target = await assertModerationAllowed(actorId, targetId);
  if (!target.isActive) {
    throw new AppError('VALIDATION_ERROR', 400, 'User is already banned');
  }
  await assertNotSoleOwner(targetId);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: { isActive: false, sessionVersion: { increment: 1 } },
    });
    // Иначе id останется в правилах канала, а сохранить такие правила сервер не даст.
    await tx.channelUserRule.deleteMany({ where: { userId: targetId } });
    await revokeAllRefreshSessionsForUser(targetId, tx);
    await writeLog(actorId, targetId, 'BAN', reason, null, tx);
  });
  invalidateChannelRules();
  publishRealtimeEvent('internal:moderation_ban_user', {
    actor_user_id: actorId,
    target_user_id: targetId,
    reason: reason ?? undefined,
  });
}

export async function kickUser(actorId: number, targetId: number, reason: string | null): Promise<void> {
  const target = await assertModerationAllowed(actorId, targetId);
  if (!target.isActive) {
    throw new AppError('VALIDATION_ERROR', 400, 'User is banned');
  }
  if (target.kickedAt) {
    throw new AppError('VALIDATION_ERROR', 400, 'User is already removed from the community');
  }
  await assertNotSoleOwner(targetId);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: { kickedAt: new Date(), sessionVersion: { increment: 1 } },
    });
    await tx.channelMember.deleteMany({ where: { userId: targetId } });
    await tx.channelUserRule.deleteMany({ where: { userId: targetId } });
    await tx.userRole.deleteMany({ where: { userId: targetId } });
    await revokeAllRefreshSessionsForUser(targetId, tx);
    await writeLog(actorId, targetId, 'KICK', reason, null, tx);
  });
  // Роли сняты — при возвращении по инвайту не должны ожить старые запреты из кэша.
  invalidateRolePermissions(targetId);
  invalidateChannelRules();
  publishRealtimeEvent('internal:moderation_kick_user', {
    actor_user_id: actorId,
    target_user_id: targetId,
    reason: reason ?? undefined,
  });
}

export async function warnUser(actorId: number, targetId: number, reason: string | null): Promise<void> {
  await assertModerationAllowed(actorId, targetId);
  await writeLog(actorId, targetId, 'WARN', reason, null);
}

/**
 * Скрыть имя: стирает `displayName` и запрещает задать новое, пока запрет не снимут.
 * Снятие старое имя не возвращает — участник задаёт его заново.
 */
export async function setDisplayNameLock(
  actorId: number,
  targetId: number,
  locked: boolean,
  reason: string | null,
): Promise<void> {
  const target = await assertModerationAllowed(actorId, targetId);
  if (target.displayNameLocked === locked) {
    throw new AppError('VALIDATION_ERROR', 400, locked ? 'Display name is already hidden' : 'Display name is not hidden');
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: locked ? { displayNameLocked: true, displayName: null } : { displayNameLocked: false },
    });
    await writeLog(actorId, targetId, locked ? 'DISPLAY_NAME_HIDE' : 'DISPLAY_NAME_UNHIDE', reason, null, tx);
  });
  publishRealtimeEvent(
    'user:updated',
    locked
      ? { user_id: targetId, display_name: null, display_name_locked: true }
      : { user_id: targetId, display_name_locked: false },
  );
}

export async function listLogs(offset: number, limit: number) {
  const rows = await prisma.moderationLog.findMany({
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
    include: {
      actor: { select: { username: true } },
      target: { select: { username: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    actor_id: r.actorId,
    actor_username: r.actor.username,
    target_user_id: r.targetUserId,
    target_username: r.target?.username ?? null,
    action: r.action,
    reason: r.reason,
    channel_id: r.channelId,
    created_at: r.createdAt.toISOString(),
  }));
}

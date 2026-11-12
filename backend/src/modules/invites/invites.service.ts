import { randomBytes } from 'node:crypto';
import type { InviteKind, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';

export const PERSONAL_INVITE_SLOTS = 3;

type UsableInvite = {
  kind: InviteKind;
  isRevoked: boolean;
  usedAt: Date | null;
  expiresAt: Date | null;
  createdBy: { isActive: boolean; kickedAt: Date | null };
};

/**
 * Единая проверка пригодности инвайта (preview и регистрация).
 * Личные коды при выключенном рубильнике или удалённом/кикнутом создателе не работают,
 * но и не отзываются: после включения они снова валидны.
 */
export function inviteRejection(
  invite: UsableInvite,
  userInvitesEnabled: boolean,
): { code: string; message: string } | null {
  if (invite.isRevoked) {
    return { code: 'INVITE_REVOKED', message: 'Invite has been revoked' };
  }
  if (invite.usedAt) {
    return { code: 'INVITE_USED', message: 'Invite has already been used' };
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return { code: 'INVITE_EXPIRED', message: 'Invite has expired' };
  }
  if (
    invite.kind === 'PERSONAL' &&
    (!userInvitesEnabled || !invite.createdBy.isActive || invite.createdBy.kickedAt)
  ) {
    return { code: 'INVITE_DISABLED', message: 'Invite is currently unavailable' };
  }
  return null;
}

export async function isUserInvitesEnabled(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<boolean> {
  const row = await client.serverSettings.findUnique({
    where: { id: 1 },
    select: { userInvitesEnabled: true },
  });
  return row?.userInvitesEnabled ?? true;
}

export async function previewInviteByCode(code: string): Promise<{ valid: boolean }> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false };
  }
  const invite = await prisma.invite.findUnique({
    where: { code: trimmed },
    include: { createdBy: { select: { isActive: true, kickedAt: true } } },
  });
  if (!invite) {
    return { valid: false };
  }
  return { valid: inviteRejection(invite, await isUserInvitesEnabled()) === null };
}

/** Досоздаёт недостающие личные слоты 1..3 (идемпотентно: уникальный индекс не даст создать лишнее). */
export async function ensurePersonalInvites(
  client: Prisma.TransactionClient | typeof prisma,
  userId: number,
): Promise<void> {
  const data = Array.from({ length: PERSONAL_INVITE_SLOTS }, (_, i) => ({
    code: randomBytes(24).toString('base64url'),
    createdById: userId,
    kind: 'PERSONAL' as const,
    slot: i + 1,
  }));
  await client.invite.createMany({ data, skipDuplicates: true });
}

export type MyInviteRow = {
  id: number;
  slot: number;
  code: string;
  status: 'active' | 'used' | 'revoked';
  used_at: string | null;
  used_by: { id: number; username: string; display_name: string | null } | null;
};

export async function listMyInvites(
  userId: number,
): Promise<{ enabled: boolean; invites: MyInviteRow[] }> {
  if (!(await isUserInvitesEnabled())) {
    return { enabled: false, invites: [] };
  }
  await ensurePersonalInvites(prisma, userId);
  const rows = await prisma.invite.findMany({
    where: { createdById: userId, kind: 'PERSONAL' },
    orderBy: { slot: 'asc' },
    include: { usedBy: { select: { id: true, username: true, displayName: true } } },
  });
  return {
    enabled: true,
    invites: rows.map((r) => ({
      id: r.id,
      slot: r.slot ?? 0,
      code: r.code,
      status: r.usedAt ? 'used' : r.isRevoked ? 'revoked' : 'active',
      used_at: r.usedAt ? r.usedAt.toISOString() : null,
      used_by: r.usedBy
        ? { id: r.usedBy.id, username: r.usedBy.username, display_name: r.usedBy.displayName }
        : null,
    })),
  };
}

export async function listInvitesForStaff(): Promise<
  {
    id: number;
    code: string;
    is_revoked: boolean;
    used_at: string | null;
    expires_at: string | null;
    created_at: string;
    created_by_username: string;
  }[]
> {
  const rows = await prisma.invite.findMany({
    // Личные коды участников в панели владельца не показываем.
    where: { kind: 'STAFF', isRevoked: false, usedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { createdBy: { select: { username: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    is_revoked: r.isRevoked,
    used_at: r.usedAt ? r.usedAt.toISOString() : null,
    expires_at: r.expiresAt ? r.expiresAt.toISOString() : null,
    created_at: r.createdAt.toISOString(),
    created_by_username: r.createdBy.username,
  }));
}

/**
 * Журнал модерации читает любой staff, а STAFF-коды видит только OWNER.
 * Полный код в журнал не пишем: по нему ADMIN зарегистрировал бы чужую учётку.
 */
export function inviteLogLabel(id: number, code: string): string {
  return `#${id} · ${code.slice(0, 4)}…`;
}

export async function createInvite(
  createdById: number,
  expiresAt: Date | null,
): Promise<{ id: number; code: string; expires_at: string | null }> {
  const code = randomBytes(24).toString('base64url');
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.invite.create({
      data: {
        code,
        createdById,
        expiresAt,
      },
    });
    await tx.moderationLog.create({
      data: {
        actorId: createdById,
        action: 'INVITE_CREATE',
        reason: inviteLogLabel(created.id, created.code),
      },
    });
    return created;
  });
  return {
    id: row.id,
    code: row.code,
    expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

export async function consumeInvite(
  tx: Prisma.TransactionClient,
  invite: { id: number; createdById: number; createdByUsername: string },
  userId: number,
): Promise<void> {
  const consumed = await tx.invite.updateMany({
    where: { id: invite.id, usedAt: null, isRevoked: false },
    data: { usedById: userId, usedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new AppError('INVITE_USED', 400, 'Invite has already been used');
  }
  await tx.moderationLog.create({
    data: {
      actorId: userId,
      targetUserId: invite.createdById,
      action: 'INVITE_USED',
      reason: `создал ${invite.createdByUsername}`,
    },
  });
}

export async function revokeInvite(inviteId: number, actorId: number): Promise<void> {
  const row = await prisma.invite.findUnique({
    where: { id: inviteId },
    include: { createdBy: { select: { username: true } } },
  });
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Invite not found');
  }
  if (row.isRevoked) {
    return;
  }
  await prisma.$transaction([
    prisma.invite.update({
      where: { id: inviteId },
      data: { isRevoked: true },
    }),
    prisma.moderationLog.create({
      data: {
        actorId,
        action: 'INVITE_DELETE',
        reason: `${inviteLogLabel(row.id, row.code)} · создал ${row.createdBy.username}`,
      },
    }),
  ]);
}

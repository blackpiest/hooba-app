import type { Announcement, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { localNow } from '../challenges/community-time.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { getCommunityTimezone } from '../server-settings/server-settings.service.js';
import type { AnnouncementInput } from './announcements.schemas.js';

/** Сколько непрочитанных объявлений отдаётся за раз: клиент показывает их по очереди. */
const PENDING_LIMIT = 10;
const LIST_LIMIT = 100;

export type AnnouncementDto = {
  id: number;
  title: string;
  body: string;
  show_at: string;
  expires_at: string | null;
  role_ids: number[];
  user_ids: number[];
  delivered_at: string | null;
  created_at: string;
  recipients_count: number;
  seen_count: number;
};

export type PendingAnnouncementDto = { id: number; title: string; body: string; show_at: string };

function toDto(row: Announcement, recipients: number, seen: number): AnnouncementDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    show_at: row.showAt,
    expires_at: row.expiresAt,
    role_ids: row.roleIds,
    user_ids: row.userIds,
    delivered_at: row.deliveredAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    recipients_count: recipients,
    seen_count: seen,
  };
}

/** Кому показывать: активные участники; пустые списки — все, иначе объединение ролей и участников. */
export function audienceWhere(roleIds: number[], userIds: number[]): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { isActive: true, kickedAt: null };
  if (roleIds.length === 0 && userIds.length === 0) {
    return base;
  }
  return {
    ...base,
    OR: [
      ...(userIds.length > 0 ? [{ id: { in: userIds } }] : []),
      ...(roleIds.length > 0 ? [{ roles: { some: { roleId: { in: roleIds } } } }] : []),
    ],
  };
}

async function assertAudience(roleIds: number[], userIds: number[]): Promise<void> {
  const [roles, users] = await Promise.all([
    roleIds.length > 0 ? prisma.role.count({ where: { id: { in: roleIds } } }) : 0,
    userIds.length > 0 ? prisma.user.count({ where: { id: { in: userIds } } }) : 0,
  ]);
  if (roles !== new Set(roleIds).size) {
    throw new AppError('VALIDATION_ERROR', 400, 'role_ids: unknown role');
  }
  if (users !== new Set(userIds).size) {
    throw new AppError('VALIDATION_ERROR', 400, 'user_ids: unknown user');
  }
}

async function loadAnnouncement(id: number): Promise<Announcement> {
  const row = await prisma.announcement.findUnique({ where: { id } });
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Announcement not found');
  }
  return row;
}

function inputData(input: AnnouncementInput) {
  return {
    title: input.title,
    body: input.body,
    showAt: input.show_at,
    expiresAt: input.expires_at,
    roleIds: [...new Set(input.role_ids)],
    userIds: [...new Set(input.user_ids)],
  };
}

export async function listAnnouncements(): Promise<AnnouncementDto[]> {
  const rows = await prisma.announcement.findMany({
    include: { _count: { select: { recipients: true } } },
    orderBy: [{ deliveredAt: { sort: 'desc', nulls: 'first' } }, { showAt: 'asc' }, { id: 'desc' }],
    take: LIST_LIMIT,
  });
  const seen = await prisma.announcementRecipient.groupBy({
    by: ['announcementId'],
    where: { announcementId: { in: rows.map((row) => row.id) }, seenAt: { not: null } },
    _count: { _all: true },
  });
  const seenById = new Map(seen.map((row) => [row.announcementId, row._count._all]));
  return rows.map((row) => toDto(row, row._count.recipients, seenById.get(row.id) ?? 0));
}

async function announcementDto(id: number): Promise<AnnouncementDto> {
  const row = await loadAnnouncement(id);
  const [recipients, seen] = await Promise.all([
    prisma.announcementRecipient.count({ where: { announcementId: id } }),
    prisma.announcementRecipient.count({ where: { announcementId: id, seenAt: { not: null } } }),
  ]);
  return toDto(row, recipients, seen);
}

export async function createAnnouncement(actorId: number, input: AnnouncementInput): Promise<AnnouncementDto> {
  await assertAudience(input.role_ids, input.user_ids);
  const row = await prisma.announcement.create({ data: { ...inputData(input), createdById: actorId } });
  await prisma.moderationLog.create({ data: { actorId, action: 'ANNOUNCEMENT_CREATE', reason: row.title } });
  // Дата могла уже наступить — тогда показываем сразу, не дожидаясь таймера.
  await deliverDueAnnouncements();
  return announcementDto(row.id);
}

/** Правка — только пока объявление не показано: после этого список получателей уже зафиксирован. */
export async function updateAnnouncement(id: number, input: AnnouncementInput): Promise<AnnouncementDto> {
  const current = await loadAnnouncement(id);
  if (current.deliveredAt) {
    throw new AppError('ANNOUNCEMENT_DELIVERED', 409, 'Announcement has already been shown');
  }
  await assertAudience(input.role_ids, input.user_ids);
  const { count } = await prisma.announcement.updateMany({ where: { id, deliveredAt: null }, data: inputData(input) });
  if (count === 0) {
    throw new AppError('ANNOUNCEMENT_DELIVERED', 409, 'Announcement has already been shown');
  }
  await deliverDueAnnouncements();
  return announcementDto(id);
}

/** Удаление снимает объявление и у тех, кто его ещё не прочитал. */
export async function deleteAnnouncement(actorId: number, id: number): Promise<void> {
  const current = await loadAnnouncement(id);
  await prisma.announcement.delete({ where: { id } });
  await prisma.moderationLog.create({ data: { actorId, action: 'ANNOUNCEMENT_DELETE', reason: current.title } });
}

async function deliverOne(row: Announcement): Promise<number[]> {
  return prisma.$transaction(async (tx) => {
    // Захват строки: параллельный прогон увидит deliveredAt и пропустит объявление.
    const claim = await tx.announcement.updateMany({ where: { id: row.id, deliveredAt: null }, data: { deliveredAt: new Date() } });
    if (claim.count === 0) {
      return [];
    }
    const users = await tx.user.findMany({ where: audienceWhere(row.roleIds, row.userIds), select: { id: true } });
    const userIds = users.map((user) => user.id);
    if (userIds.length > 0) {
      await tx.announcementRecipient.createMany({
        data: userIds.map((userId) => ({ announcementId: row.id, userId })),
        skipDuplicates: true,
      });
    }
    return userIds;
  });
}

let running: Promise<void> | null = null;

/**
 * Объявления, чья дата наступила: фиксирует получателей (кто есть в сообществе сейчас) и говорит
 * онлайн-получателям перечитать очередь. Прогоны не пересекаются.
 */
export function deliverDueAnnouncements(): Promise<void> {
  const run = (running ?? Promise.resolve()).then(async () => {
    const now = localNow(await getCommunityTimezone());
    const due = await prisma.announcement.findMany({ where: { deliveredAt: null, showAt: { lte: now } }, orderBy: { showAt: 'asc' } });
    for (const row of due) {
      const userIds = await deliverOne(row);
      if (userIds.length > 0) {
        publishRealtimeEvent('internal:announcement_delivered', { announcement_id: row.id, user_ids: userIds });
      }
    }
  });
  // Очередь ждёт завершения, а не успеха: упавший прогон не должен отклонять все следующие.
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  running = settled;
  void settled.then(() => {
    if (running === settled) running = null;
  });
  return run;
}

/** Мои непрочитанные объявления, срок которых не истёк, — от старых к новым. */
export async function listMyPending(userId: number): Promise<PendingAnnouncementDto[]> {
  await deliverDueAnnouncements();
  const now = localNow(await getCommunityTimezone());
  const rows = await prisma.announcementRecipient.findMany({
    where: { userId, seenAt: null, announcement: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
    include: { announcement: true },
    orderBy: [{ announcement: { showAt: 'asc' } }, { announcementId: 'asc' }],
    take: PENDING_LIMIT,
  });
  return rows.map(({ announcement: a }) => ({ id: a.id, title: a.title, body: a.body, show_at: a.showAt }));
}

/** Закрыл модалку — больше не показывать. Чужое или удалённое объявление — тихо ничего. */
export async function markSeen(userId: number, announcementId: number): Promise<void> {
  await prisma.announcementRecipient.updateMany({ where: { announcementId, userId, seenAt: null }, data: { seenAt: new Date() } });
}

import type { CosmeticKind as DbCosmeticKind } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { loadAvatarCatalog, type AvatarCatalog } from '../avatars/avatar-catalog.js';
import {
  fromDbKind,
  itemKey,
  toDbKind,
  LOCKABLE_KINDS,
  rewardLockedItems,
  unlistedItems,
  type CosmeticKind,
} from '../cosmetics/cosmetic-access.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';

/** Сколько выполненных испытаний перечислять по названию. */
const COMPLETED_LIST_LIMIT = 5;

/** Что появилось в конструкторе профиля после последнего просмотра. */
export type ProfileNewsDto = {
  cosmetics: number;
  /** Вид самого свежего нового предмета — на эту вкладку ведёт подсказка; null — новых предметов нет. */
  cosmetic_kind: CosmeticKind | null;
  challenges: number;
  /** Новые испытания (их `challenges` штук): в конструкторе на них метка «Новое». */
  challenge_ids: number[];
  /** Выполненные испытания, свежие первыми (до `COMPLETED_LIST_LIMIT`); всего — `completed_count`. */
  completed: { id: number; title: string }[];
  completed_count: number;
};

function catalogIds(catalog: AvatarCatalog): Record<CosmeticKind, Set<string>> {
  const ids = (items: { id: string }[]) => new Set(items.map((item) => item.id));
  return {
    badge: ids(catalog.badges),
    title: ids(catalog.titles),
    frame: ids(catalog.frames),
    background: ids(catalog.backgrounds),
    character: ids(catalog.characters),
  };
}

/**
 * Выдачи, о которых стоит сообщать: предмет есть в каталоге и в конструкторе что-то меняет. Рамка, фон или персонаж,
 * открытые всем (не награда испытания и не в запасе), — не новость. Порядок строк сохраняется.
 */
async function noteworthy(rows: { kind: DbCosmeticKind; itemId: string }[]): Promise<{ kind: CosmeticKind; id: string }[]> {
  if (rows.length === 0) {
    return [];
  }
  const [catalog, locked] = await Promise.all([loadAvatarCatalog(), rewardLockedItems()]);
  const known = catalogIds(catalog);
  const unlisted = unlistedItems(catalog);
  return rows
    .map((row) => ({ kind: fromDbKind(row.kind), id: row.itemId }))
    .filter(({ kind, id }) => {
      if (!known[kind].has(id)) return false;
      const key = itemKey(kind, id);
      return !LOCKABLE_KINDS.has(kind) || locked.has(key) || unlisted.has(key);
    });
}

/**
 * Новое = выданное лично мне (владельцем или за испытание; `LEGACY` и значки роли не в счёт),
 * выполненные мной испытания (в том числе с наградой, которая уже была) и опубликованные испытания,
 * кроме собственных (автор о своём испытании и так знает) и уже выполненных.
 * Предмет не новость, если в конструкторе он ничего не меняет: рамка, фон или персонаж открыты всем
 * (не награда испытания и не в запасе), предмет убран из каталога или титул скрыт.
 */
export async function getProfileNews(userId: number): Promise<ProfileNewsDto> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { profileSeenAt: true } });
  if (!user) {
    throw new AppError('NOT_FOUND', 404, 'User not found');
  }
  const since = user.profileSeenAt;
  const completedWhere = { userId, completedAt: { gt: since } };
  const [granted, challenges, completed, completedCount] = await Promise.all([
    prisma.userCosmetic.findMany({
      where: { userId, source: { in: ['MANUAL', 'CHALLENGE'] }, createdAt: { gt: since } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { kind: true, itemId: true },
    }),
    prisma.challenge.findMany({
      where: {
        status: 'ACTIVE',
        publishedAt: { gt: since },
        OR: [{ createdById: null }, { createdById: { not: userId } }],
        completions: { none: { userId } },
      },
      orderBy: { publishedAt: 'desc' },
      select: { id: true },
    }),
    prisma.challengeCompletion.findMany({
      where: completedWhere,
      orderBy: { completedAt: 'desc' },
      take: COMPLETED_LIST_LIMIT,
      select: { challenge: { select: { id: true, title: true } } },
    }),
    prisma.challengeCompletion.count({ where: completedWhere }),
  ]);
  const fresh = await noteworthy(granted);
  return {
    cosmetics: fresh.length,
    cosmetic_kind: fresh[0]?.kind ?? null,
    challenges: challenges.length,
    challenge_ids: challenges.map((row) => row.id),
    completed: completed.map((row) => row.challenge),
    completed_count: completedCount,
  };
}

/** Всё текущее — просмотрено; другие вкладки и устройства участника перечитывают новинки и прячут подсказку. */
export async function markProfileNewsSeen(userId: number): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { profileSeenAt: new Date() } });
  publishRealtimeEvent('internal:profile_news', { user_id: userId });
}

/**
 * Ключи `itemKey` предметов с меткой «Новое» в конструкторе: выданы мне (владельцем или за испытание),
 * я на них ещё не нажимал и они что-то меняют (как в `getProfileNews`).
 */
export async function unseenCosmetics(userId: number): Promise<Set<string>> {
  const rows = await prisma.userCosmetic.findMany({
    where: { userId, source: { in: ['MANUAL', 'CHALLENGE'] }, seenAt: null },
    select: { kind: true, itemId: true },
  });
  return new Set((await noteworthy(rows)).map(({ kind, id }) => itemKey(kind, id)));
}

/** Нажал на предмет в конструкторе: метка «Новое» снимается. Нет такой выдачи — ничего не делаем. */
export async function markCosmeticSeen(userId: number, kind: CosmeticKind, id: string): Promise<void> {
  await prisma.userCosmetic.updateMany({
    where: { userId, kind: toDbKind(kind), itemId: id, seenAt: null },
    data: { seenAt: new Date() },
  });
}

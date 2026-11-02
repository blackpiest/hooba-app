import type { CosmeticKind as DbCosmeticKind, CosmeticSource } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { loadAvatarCatalog, type AvatarCatalog } from '../avatars/avatar-catalog.js';
import {
  canUseCosmetic,
  fromDbKind,
  itemKey,
  loadCosmeticAccess,
  toDbKind,
  type CosmeticKind,
} from '../cosmetics/cosmetic-access.js';
import { unseenCosmetics } from '../profile-news/profile-news.service.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { setAvatarField } from '../users/users.service.js';

/** Сколько значков можно закрепить на карточке. */
export const PINNED_BADGES_MAX = 3;

/** Что видно другим: закреплённые значки (по порядку) и титул. */
export type Showcase = { badges: string[]; title: string | null };

/** `role` — от роли (у владельца так помечено всё), остальное — как в `UserCosmetic.source`. */
export type OwnedSource = 'role' | 'manual' | 'challenge' | 'legacy';
/** `new` — метка «Новое» в конструкторе: выдано, а участник ещё не нажимал на предмет (`unseenCosmetics`). */
export type OwnedBadgeDto = { id: string; source: OwnedSource; granted_at: string; new?: true };
export type OwnedTitleDto = { id: string; source: OwnedSource; granted_at: string; new?: true };
/** Рамки, фоны, персонажи сверх открытых всем: выданные, заработанные, LEGACY. */
export type OwnedItemDto = { kind: CosmeticKind; id: string; source: OwnedSource; granted_at: string; new?: true };
export type CosmeticsDto = {
  badges: OwnedBadgeDto[];
  titles: OwnedTitleDto[];
  items: OwnedItemDto[];
  pinned_badges: string[];
  title: string | null;
};

/** Поля пользователя, из которых собирается витрина. */
export type ShowcaseSource = {
  pinnedBadges: string[];
  titleId: string | null;
  roles: { createdAt: Date; role: { key: string | null; badgeId: string | null } }[];
  cosmetics: { kind: DbCosmeticKind; itemId: string; source: CosmeticSource; createdAt: Date }[];
};

/** include для findMany/findUnique пользователя, чтобы хватило на `showcaseOf`. */
export const SHOWCASE_INCLUDE = {
  roles: { include: { role: true } },
  cosmetics: { select: { kind: true, itemId: true, source: true, createdAt: true } },
} as const;

function sourceOf(source: CosmeticSource): OwnedSource {
  return source.toLowerCase() as OwnedSource;
}

/** Когда выдана роль OWNER; null — не владелец. */
function ownerRoleSince(user: ShowcaseSource): string | null {
  const owner = user.roles.find((ur) => ur.role.key === 'OWNER');
  return owner ? owner.createdAt.toISOString() : null;
}

/** Записи UserCosmetic нужного вида, которые есть в каталоге. */
function storedOf(user: ShowcaseSource, kind: CosmeticKind, known: ReadonlySet<string>) {
  return user.cosmetics.filter((row) => fromDbKind(row.kind) === kind && known.has(row.itemId));
}

/**
 * Значки пользователя: от ролей (пока роль есть), выданные и заработанные. Только те, что есть в каталоге:
 * удалённый из каталога значок просто перестаёт показываться. Владельцу открыт весь каталог.
 */
function ownedBadges(user: ShowcaseSource, catalog: AvatarCatalog): OwnedBadgeDto[] {
  const known = new Set(catalog.badges.map((item) => item.id));
  const owned = new Map<string, OwnedBadgeDto>();
  for (const ur of user.roles) {
    const id = ur.role.badgeId;
    if (id && known.has(id) && !owned.has(id)) {
      owned.set(id, { id, source: 'role', granted_at: ur.createdAt.toISOString() });
    }
  }
  for (const row of storedOf(user, 'badge', known)) {
    if (!owned.has(row.itemId)) {
      owned.set(row.itemId, { id: row.itemId, source: sourceOf(row.source), granted_at: row.createdAt.toISOString() });
    }
  }
  const ownerSince = ownerRoleSince(user);
  if (ownerSince) {
    for (const badge of catalog.badges) {
      if (!owned.has(badge.id)) {
        owned.set(badge.id, { id: badge.id, source: 'role', granted_at: ownerSince });
      }
    }
  }
  return [...owned.values()];
}

function ownedTitles(user: ShowcaseSource, catalog: AvatarCatalog): OwnedTitleDto[] {
  const known = new Set(catalog.titles.map((item) => item.id));
  const owned: OwnedTitleDto[] = storedOf(user, 'title', known).map((row) => ({
    id: row.itemId,
    source: sourceOf(row.source),
    granted_at: row.createdAt.toISOString(),
  }));
  const ownerSince = ownerRoleSince(user);
  if (ownerSince) {
    const has = new Set(owned.map((item) => item.id));
    for (const title of catalog.titles) {
      if (!has.has(title.id)) {
        owned.push({ id: title.id, source: 'role', granted_at: ownerSince });
      }
    }
  }
  return owned;
}

function ownedItems(user: ShowcaseSource, catalog: AvatarCatalog): OwnedItemDto[] {
  const lists: [CosmeticKind, { id: string }[]][] = [
    ['frame', catalog.frames],
    ['background', catalog.backgrounds],
    ['character', catalog.characters],
  ];
  return lists.flatMap(([kind, list]) =>
    storedOf(user, kind, new Set(list.map((item) => item.id))).map((row) => ({
      kind,
      id: row.itemId,
      source: sourceOf(row.source),
      granted_at: row.createdAt.toISOString(),
    })),
  );
}

/**
 * Витрина фильтруется при чтении: снятая роль или отозванный значок сразу пропадают с карточки,
 * отдельно чистить `pinnedBadges` не нужно.
 */
export function showcaseOf(user: ShowcaseSource, catalog: AvatarCatalog): Showcase {
  const badges = new Set(ownedBadges(user, catalog).map((item) => item.id));
  const titles = new Set(ownedTitles(user, catalog).map((item) => item.id));
  return {
    badges: user.pinnedBadges.filter((id) => badges.has(id)).slice(0, PINNED_BADGES_MAX),
    title: user.titleId !== null && titles.has(user.titleId) ? user.titleId : null,
  };
}

async function loadSource(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: SHOWCASE_INCLUDE });
  if (!user) {
    throw new AppError('NOT_FOUND', 404, 'User not found');
  }
  return user;
}

async function loadActiveTarget(targetId: number) {
  const user = await loadSource(targetId);
  if (!user.isActive || user.kickedAt) {
    throw new AppError('NOT_FOUND', 404, 'User not found');
  }
  return user;
}

export async function getCosmetics(userId: number): Promise<CosmeticsDto> {
  const [user, catalog, unseen] = await Promise.all([loadSource(userId), loadAvatarCatalog(), unseenCosmetics(userId)]);
  const showcase = showcaseOf(user, catalog);
  const fresh = (kind: CosmeticKind, id: string) => (unseen.has(itemKey(kind, id)) ? { new: true as const } : {});
  return {
    badges: ownedBadges(user, catalog).map((item) => ({ ...item, ...fresh('badge', item.id) })),
    titles: ownedTitles(user, catalog).map((item) => ({ ...item, ...fresh('title', item.id) })),
    items: ownedItems(user, catalog).map((item) => ({ ...item, ...fresh(item.kind, item.id) })),
    pinned_badges: showcase.badges,
    title: showcase.title,
  };
}

/** Пересчитать витрину и разослать всем (`user:updated`): после выдачи, отзыва, смены ролей. */
export async function publishShowcase(userId: number): Promise<Showcase> {
  const [user, catalog] = await Promise.all([loadSource(userId), loadAvatarCatalog()]);
  const showcase = showcaseOf(user, catalog);
  publishRealtimeEvent('user:updated', { user_id: userId, badges: showcase.badges, title: showcase.title });
  return showcase;
}

/** То же для всех носителей роли — после смены её значка или удаления. */
export async function publishShowcaseForUsers(userIds: number[]): Promise<void> {
  for (const userId of userIds) {
    await publishShowcase(userId);
  }
}

export async function setMyShowcase(
  userId: number,
  input: { pinned_badges: string[]; title: string | null },
): Promise<{ pinned_badges: string[]; title: string | null }> {
  if (new Set(input.pinned_badges).size !== input.pinned_badges.length) {
    throw new AppError('VALIDATION_ERROR', 400, 'pinned_badges: duplicates');
  }
  const [user, catalog] = await Promise.all([loadSource(userId), loadAvatarCatalog()]);
  const badges = new Set(ownedBadges(user, catalog).map((item) => item.id));
  if (input.pinned_badges.some((id) => !badges.has(id))) {
    throw new AppError('BADGE_NOT_OWNED', 403, 'pinned_badges: badge is not owned');
  }
  if (input.title !== null && !ownedTitles(user, catalog).some((item) => item.id === input.title)) {
    throw new AppError('TITLE_NOT_OWNED', 403, 'title: title is not owned');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { pinnedBadges: input.pinned_badges, titleId: input.title },
  });
  publishRealtimeEvent('user:updated', { user_id: userId, badges: input.pinned_badges, title: input.title });
  return { pinned_badges: input.pinned_badges, title: input.title };
}

async function logCosmetic(
  actorId: number,
  targetUserId: number,
  action: 'COSMETIC_GRANT' | 'COSMETIC_REVOKE',
  reason: string,
): Promise<void> {
  await prisma.moderationLog.create({ data: { actorId, targetUserId, action, reason } });
}

/** Есть ли предмет в каталоге; значок роли вручную не выдаётся. */
async function requireGrantable(kind: CosmeticKind, id: string): Promise<void> {
  const catalog = await loadAvatarCatalog();
  const list: { id: string }[] = {
    badge: catalog.badges,
    title: catalog.titles,
    frame: catalog.frames,
    background: catalog.backgrounds,
    character: catalog.characters,
  }[kind];
  if (!list.some((item) => item.id === id)) {
    throw new AppError('NOT_FOUND', 404, 'Cosmetic not found');
  }
  if (kind === 'badge' && catalog.badges.find((item) => item.id === id)?.category === 'role') {
    throw new AppError('VALIDATION_ERROR', 400, 'Role badges come with roles and cannot be granted');
  }
}

/**
 * Выдать предмет (вручную — владелец, `requireOwner` в роуте; `CHALLENGE`/`LEGACY` — оценщик испытаний).
 * Повторная выдача ничего не меняет и возвращает false.
 */
export async function storeCosmetic(
  userId: number,
  kind: CosmeticKind,
  id: string,
  source: CosmeticSource,
  extra: { grantedById?: number; challengeId?: number } = {},
): Promise<boolean> {
  const created = await prisma.userCosmetic.createMany({
    data: [{ userId, kind: toDbKind(kind), itemId: id, source, ...extra }],
    skipDuplicates: true,
  });
  // Новинка в конструкторе: получатель видит подсказку у кнопки профиля (`LEGACY` — уже носил, не новость).
  if (created.count > 0 && source !== 'LEGACY') {
    publishRealtimeEvent('internal:profile_news', { user_id: userId });
  }
  return created.count > 0;
}

export async function grantCosmetic(
  actorId: number,
  targetId: number,
  kind: CosmeticKind,
  id: string,
): Promise<CosmeticsDto> {
  await requireGrantable(kind, id);
  await loadActiveTarget(targetId);
  // Витрина не меняется: новый значок ещё не закреплён. Сам получатель увидит его, открыв конструктор.
  if (await storeCosmetic(targetId, kind, id, 'MANUAL', { grantedById: actorId })) {
    await logCosmetic(actorId, targetId, 'COSMETIC_GRANT', `${kind} ${id}`);
  }
  return getCosmetics(targetId);
}

/**
 * Отзыв снимает предмет и с участника: значок — с витрины, титул — сбрасывается, рамка/фон/персонаж —
 * снимается, если без этой записи он закрыт (награда испытания). Иначе предмет не всплыл бы сам при повторной выдаче.
 */
export async function revokeCosmetic(
  actorId: number,
  targetId: number,
  kind: CosmeticKind,
  id: string,
): Promise<CosmeticsDto> {
  const user = await loadActiveTarget(targetId);
  const deleted = await prisma.userCosmetic.deleteMany({ where: { userId: targetId, kind: toDbKind(kind), itemId: id } });
  if (deleted.count === 0) {
    return getCosmetics(targetId);
  }
  await logCosmetic(actorId, targetId, 'COSMETIC_REVOKE', `${kind} ${id}`);
  if (kind === 'badge' || kind === 'title') {
    await prisma.user.update({
      where: { id: targetId },
      data:
        kind === 'badge'
          ? { pinnedBadges: user.pinnedBadges.filter((pinned) => pinned !== id) }
          : { titleId: user.titleId === id ? null : user.titleId },
    });
    await publishShowcase(targetId);
  } else {
    const field = { frame: 'avatarFrame', background: 'avatarBackground', character: 'avatarCharacter' } as const;
    if (user[field[kind]] === id && !canUseCosmetic(await loadCosmeticAccess(targetId), kind, id)) {
      await setAvatarField(targetId, kind, null);
    }
  }
  return getCosmetics(targetId);
}

export const grantBadge = (actorId: number, targetId: number, badgeId: string) =>
  grantCosmetic(actorId, targetId, 'badge', badgeId);
export const revokeBadge = (actorId: number, targetId: number, badgeId: string) =>
  revokeCosmetic(actorId, targetId, 'badge', badgeId);
export const grantTitle = (actorId: number, targetId: number, titleId: string) =>
  grantCosmetic(actorId, targetId, 'title', titleId);
export const revokeTitle = (actorId: number, targetId: number, titleId: string) =>
  revokeCosmetic(actorId, targetId, 'title', titleId);

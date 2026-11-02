import { randomBytes } from 'node:crypto';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import {
  loadAvatarCatalog,
  loadCatalogFile,
  type AvatarBadge,
  type AvatarBadgeCategory,
  type AvatarCatalog,
} from '../avatars/avatar-catalog.js';
import { publishShowcaseForUsers } from '../badges/badges.service.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { keepForWearers, LOCKABLE_KINDS, parseRewards, toDbKind, type CosmeticKind } from './cosmetic-access.js';
import { EDITABLE_BADGE_CATEGORIES, invalidateCosmeticTexts } from './cosmetic-texts.js';

const FILES_PREFIX = '/api/v1/avatars/files/';
/** Сколько своих титулов может завести владелец. */
export const CUSTOM_TITLES_MAX = 100;

export type BadgeTexts = { name: string; description: string; category: AvatarBadgeCategory; hint: string | null };
/** `badge` — значок для иконки, null — без иконки. */
export type TitleTexts = { label: string; badge: string | null };

/** Витрина (виден в конструкторе всем) или запас (только получившим). `listed_default` — как в каталоге, у своих титулов null. */
type ListedDto = { listed: boolean; listed_default: boolean | null };

export type CosmeticTextsDto = {
  badges: (ListedDto & {
    id: string;
    icon: AvatarBadge['icon'] | { url: string };
    defaults: BadgeTexts;
    /** Правка владельца; null — как в каталоге. */
    override: BadgeTexts | null;
  })[];
  titles: (ListedDto & {
    id: string;
    /** `custom` — создан владельцем: удаляется насовсем; `catalog` — из catalog.json: только скрывается. */
    source: 'catalog' | 'custom';
    hidden: boolean;
    /** Как в каталоге; у своих — null. */
    defaults: TitleTexts | null;
    /** Правка поверх каталога; null — как в каталоге (у своих всегда null). */
    override: TitleTexts | null;
    current: TitleTexts;
    /** У скольких участников титул выдан — для предупреждения при удалении. */
    holders: number;
  })[];
  /** Рамки, фоны, персонажи: только витрина/запас (превью клиент рисует по каталогу). */
  items: (ListedDto & { kind: 'frame' | 'background' | 'character'; id: string; label: string })[];
};

/** Для админки: значения каталога и правки отдельно, чтобы показать «как в каталоге» и вернуть его. */
export async function listCosmeticTexts(): Promise<CosmeticTextsDto> {
  const [catalog, rows, customTitles, holderRows] = await Promise.all([
    loadCatalogFile(),
    prisma.cosmeticText.findMany(),
    prisma.customTitle.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    prisma.userCosmetic.groupBy({ by: ['itemId'], where: { kind: 'TITLE' }, _count: { _all: true } }),
  ]);
  const holders = new Map(holderRows.map((row) => [row.itemId, row._count._all]));
  const catalogTitleIds = new Set(catalog.titles.map((title) => title.id));
  const badgeRows = new Map(rows.filter((row) => row.kind === 'BADGE').map((row) => [row.itemId, row]));
  const titleRows = new Map(rows.filter((row) => row.kind === 'TITLE').map((row) => [row.itemId, row]));
  const listedRows = new Map(rows.map((row) => [`${row.kind}:${row.itemId}`, row.listed]));
  const listedOf = (kind: CosmeticKind, item: { id: string; listed: boolean }): ListedDto => ({
    listed: listedRows.get(`${toDbKind(kind)}:${item.id}`) ?? item.listed,
    listed_default: item.listed,
  });
  return {
    badges: catalog.badges.map((badge) => {
      const defaults: BadgeTexts = {
        name: badge.name,
        description: badge.description,
        category: badge.category,
        hint: badge.hint ?? null,
      };
      const row = badgeRows.get(badge.id);
      return {
        id: badge.id,
        ...listedOf('badge', badge),
        icon: 'file' in badge.icon ? { url: `${FILES_PREFIX}${badge.icon.file}?v=${catalog.version}` } : badge.icon,
        defaults,
        override: row
          ? {
              name: row.name ?? defaults.name,
              description: row.description ?? defaults.description,
              category: (row.category as AvatarBadgeCategory | null) ?? defaults.category,
              hint: row.hint === null ? defaults.hint : row.hint || null,
            }
          : null,
      };
    }),
    titles: [
      ...catalog.titles.map((title) => {
        const row = titleRows.get(title.id);
        const defaults: TitleTexts = { label: title.label, badge: title.badge ?? null };
        const override =
          row && (row.name || row.badge !== null)
            ? { label: row.name || defaults.label, badge: row.badge === null ? defaults.badge : row.badge || null }
            : null;
        return {
          id: title.id,
          ...listedOf('title', title),
          source: 'catalog' as const,
          hidden: row?.hidden ?? false,
          defaults,
          override,
          current: override ?? defaults,
          holders: holders.get(title.id) ?? 0,
        };
      }),
      ...customTitles
        .filter((title) => !catalogTitleIds.has(title.id))
        .map((title) => ({
          id: title.id,
          listed: title.listed,
          listed_default: null,
          source: 'custom' as const,
          hidden: false,
          defaults: null,
          override: null,
          current: { label: title.label, badge: title.badgeId },
          holders: holders.get(title.id) ?? 0,
        })),
    ],
    items: [
      ...catalog.frames.map((item) => ({ kind: 'frame' as const, id: item.id, label: item.label, ...listedOf('frame', item) })),
      ...catalog.backgrounds.map((item) => ({
        kind: 'background' as const,
        id: item.id,
        label: item.label,
        ...listedOf('background', item),
      })),
      ...catalog.characters.map((item) => ({
        kind: 'character' as const,
        id: item.id,
        label: item.name ?? item.id,
        ...listedOf('character', item),
      })),
    ],
  };
}

async function changed(actorId: number, reason: string): Promise<void> {
  invalidateCosmeticTexts();
  await prisma.moderationLog.create({ data: { actorId, action: 'COSMETIC_EDIT', reason } });
  publishRealtimeEvent('cosmetics:changed', {});
}

/** Строка без правок (всё как в каталоге, не скрыт, витрина как в каталоге) не нужна: кнопке «вернуть» нечего возвращать. */
async function dropEmptyRow(kind: CosmeticKind, itemId: string): Promise<void> {
  await prisma.cosmeticText.deleteMany({
    where: {
      kind: toDbKind(kind),
      itemId,
      name: null,
      description: null,
      category: null,
      hint: null,
      badge: null,
      hidden: false,
      listed: null,
    },
  });
}

const NO_TEXTS = { name: null, description: null, category: null, hint: null, badge: null };

/**
 * Тексты значка. Совпали с каталогом — правка удаляется (кнопке «вернуть» нечего возвращать).
 * Категорию «Роль» нельзя ни выставить, ни снять: только такие значки выдаются ролью и не выдаются вручную.
 */
export async function setBadgeTexts(actorId: number, id: string, input: BadgeTexts): Promise<CosmeticTextsDto> {
  const badge = (await loadCatalogFile()).badges.find((item) => item.id === id);
  if (!badge) {
    throw new AppError('NOT_FOUND', 404, 'Badge not found');
  }
  const roleBadge = badge.category === 'role';
  if (roleBadge ? input.category !== 'role' : !EDITABLE_BADGE_CATEGORIES.includes(input.category)) {
    throw new AppError('ROLE_CATEGORY_FIXED', 400, 'The role category cannot be set or removed');
  }
  const hint = input.hint?.trim() || null;
  const sameAsCatalog =
    input.name === badge.name &&
    input.description === badge.description &&
    input.category === badge.category &&
    hint === (badge.hint ?? null);
  if (sameAsCatalog) {
    await prisma.cosmeticText.updateMany({ where: { kind: 'BADGE', itemId: id }, data: { ...NO_TEXTS, updatedById: actorId } });
    await dropEmptyRow('badge', id);
  } else {
    const data = { name: input.name, description: input.description, category: input.category, hint: hint ?? '', updatedById: actorId };
    await prisma.cosmeticText.upsert({
      where: { kind_itemId: { kind: 'BADGE', itemId: id } },
      create: { kind: 'BADGE', itemId: id, ...data },
      update: data,
    });
  }
  await changed(actorId, `badge ${id}`);
  return listCosmeticTexts();
}

/** Значок для иконки титула должен быть в каталоге (с правками владельца). */
async function assertTitleBadge(badge: string | null): Promise<void> {
  if (badge !== null && !(await loadAvatarCatalog()).badges.some((item) => item.id === badge)) {
    throw new AppError('VALIDATION_ERROR', 400, 'badge: unknown badge');
  }
}

/** Титул нельзя убрать, пока он награда неархивного испытания: оценщик выдал бы несуществующий id. */
async function assertNotChallengeReward(id: string): Promise<void> {
  const challenges = await prisma.challenge.findMany({
    where: { status: { in: ['DRAFT', 'ACTIVE'] } },
    select: { title: true, rewards: true },
  });
  const used = challenges.find((challenge) =>
    parseRewards(challenge.rewards).some((reward) => reward.kind === 'title' && reward.id === id),
  );
  if (used) {
    throw new AppError('TITLE_IN_USE', 409, `Title is a reward of challenge «${used.title}»`);
  }
}

async function titleWearers(id: string): Promise<number[]> {
  const users = await prisma.user.findMany({ where: { titleId: id }, select: { id: true } });
  return users.map((user) => user.id);
}

export async function createTitle(actorId: number, input: TitleTexts): Promise<CosmeticTextsDto> {
  await assertTitleBadge(input.badge);
  if ((await prisma.customTitle.count()) >= CUSTOM_TITLES_MAX) {
    throw new AppError('TITLES_LIMIT', 409, `At most ${CUSTOM_TITLES_MAX} custom titles`);
  }
  const taken = new Set((await loadCatalogFile()).titles.map((title) => title.id));
  let id: string;
  do {
    id = `t-${randomBytes(4).toString('hex')}`;
  } while (taken.has(id) || (await prisma.customTitle.findUnique({ where: { id }, select: { id: true } })));
  await prisma.customTitle.create({ data: { id, label: input.label, badgeId: input.badge, createdById: actorId } });
  await changed(actorId, `title ${id} created`);
  return listCosmeticTexts();
}

/**
 * Подпись и значок титула. Свой — меняется на месте; каталожный — правкой поверх каталога,
 * которая удаляется, если совпала с каталогом (и титул не скрыт, витрина как в каталоге). `badge: undefined` — значок не трогать.
 */
export async function setTitleTexts(
  actorId: number,
  id: string,
  input: { label: string; badge?: string | null },
): Promise<CosmeticTextsDto> {
  if (input.badge !== undefined) {
    await assertTitleBadge(input.badge);
  }
  const title = (await loadCatalogFile()).titles.find((item) => item.id === id);
  if (!title) {
    const custom = await prisma.customTitle.findUnique({ where: { id }, select: { id: true } });
    if (!custom) {
      throw new AppError('NOT_FOUND', 404, 'Title not found');
    }
    await prisma.customTitle.update({
      where: { id },
      data: { label: input.label, ...(input.badge !== undefined ? { badgeId: input.badge } : {}) },
    });
    await changed(actorId, `title ${id}`);
    return listCosmeticTexts();
  }
  const row = await prisma.cosmeticText.findUnique({ where: { kind_itemId: { kind: 'TITLE', itemId: id } } });
  const catalogBadge = title.badge ?? null;
  // В БД: null — как в каталоге, '' — «без иконки».
  const badge =
    input.badge === undefined ? (row?.badge ?? null) : input.badge === catalogBadge ? null : (input.badge ?? '');
  const name = input.label === title.label ? null : input.label;
  await prisma.cosmeticText.upsert({
    where: { kind_itemId: { kind: 'TITLE', itemId: id } },
    create: { kind: 'TITLE', itemId: id, name, badge, updatedById: actorId },
    update: { name, badge, updatedById: actorId },
  });
  await dropEmptyRow('title', id);
  await changed(actorId, `title ${id}`);
  return listCosmeticTexts();
}

/**
 * Свой титул удаляется насовсем — вместе с выдачами и выбором в витрине. Каталожный только скрывается:
 * выдачи остаются и вернутся вместе с ним (`restoreTitle`).
 */
export async function deleteTitle(actorId: number, id: string): Promise<CosmeticTextsDto> {
  const inCatalog = (await loadCatalogFile()).titles.some((item) => item.id === id);
  if (!inCatalog && !(await prisma.customTitle.findUnique({ where: { id }, select: { id: true } }))) {
    throw new AppError('NOT_FOUND', 404, 'Title not found');
  }
  await assertNotChallengeReward(id);
  const wearers = await titleWearers(id);
  if (inCatalog) {
    await prisma.cosmeticText.upsert({
      where: { kind_itemId: { kind: 'TITLE', itemId: id } },
      create: { kind: 'TITLE', itemId: id, hidden: true, updatedById: actorId },
      update: { hidden: true, updatedById: actorId },
    });
  } else {
    await prisma.$transaction([
      prisma.userCosmetic.deleteMany({ where: { kind: 'TITLE', itemId: id } }),
      prisma.user.updateMany({ where: { titleId: id }, data: { titleId: null } }),
      prisma.customTitle.delete({ where: { id } }),
    ]);
  }
  await changed(actorId, `title ${id} ${inCatalog ? 'hidden' : 'deleted'}`);
  await publishShowcaseForUsers(wearers);
  return listCosmeticTexts();
}

/** Вернуть скрытый титул каталога. Не скрыт — ничего не меняется. */
export async function restoreTitle(actorId: number, id: string): Promise<CosmeticTextsDto> {
  const where = { kind_itemId: { kind: 'TITLE' as const, itemId: id } };
  const row = await prisma.cosmeticText.findUnique({ where });
  if (!row?.hidden) {
    return listCosmeticTexts();
  }
  await prisma.cosmeticText.update({ where, data: { hidden: false, updatedById: actorId } });
  await dropEmptyRow('title', id);
  await changed(actorId, `title ${id} restored`);
  await publishShowcaseForUsers(await titleWearers(id));
  return listCosmeticTexts();
}

/**
 * Вернуть тексты из каталога. Правки не было — ничего не меняется и в журнал не пишется.
 * Скрытие и витрина/запас не трогаются: возврат подписи не должен показывать предмет снова.
 */
export async function resetTexts(actorId: number, kind: 'badge' | 'title', id: string): Promise<CosmeticTextsDto> {
  const { count } = await prisma.cosmeticText.updateMany({
    where: {
      kind: toDbKind(kind),
      itemId: id,
      OR: [
        { name: { not: null } },
        { description: { not: null } },
        { category: { not: null } },
        { hint: { not: null } },
        { badge: { not: null } },
      ],
    },
    data: { ...NO_TEXTS, updatedById: actorId },
  });
  await dropEmptyRow(kind, id);
  if (count > 0) {
    await changed(actorId, `${kind} ${id} reset`);
  }
  return listCosmeticTexts();
}

/** Предмет catalog.json; null — нет в файле (свои титулы ищет вызывающий). */
function catalogItem(catalog: AvatarCatalog, kind: CosmeticKind, id: string): { listed: boolean } | null {
  const lists: Record<CosmeticKind, { id: string; listed: boolean }[]> = {
    badge: catalog.badges,
    title: catalog.titles,
    frame: catalog.frames,
    background: catalog.backgrounds,
    character: catalog.characters,
  };
  return lists[kind].find((item) => item.id === id) ?? null;
}

/**
 * Витрина или запас. Выдачи не трогаются: получившие видят предмет и дальше. Рамку, фон, персонажа из запаса
 * носит только получивший, поэтому тем, кто носит его сейчас, он остаётся (`LEGACY`).
 */
export async function setListed(actorId: number, kind: CosmeticKind, id: string, listed: boolean): Promise<CosmeticTextsDto> {
  const item = catalogItem(await loadCatalogFile(), kind, id);
  if (item) {
    const dbKind = toDbKind(kind);
    const value = listed === item.listed ? null : listed;
    await prisma.cosmeticText.upsert({
      where: { kind_itemId: { kind: dbKind, itemId: id } },
      create: { kind: dbKind, itemId: id, listed: value, updatedById: actorId },
      update: { listed: value, updatedById: actorId },
    });
    await dropEmptyRow(kind, id);
  } else if (kind === 'title' && (await prisma.customTitle.findUnique({ where: { id }, select: { id: true } }))) {
    await prisma.customTitle.update({ where: { id }, data: { listed } });
  } else {
    throw new AppError('NOT_FOUND', 404, 'Item not found');
  }
  if (!listed && LOCKABLE_KINDS.has(kind)) {
    await keepForWearers([{ kind, id }]);
  }
  await changed(actorId, `${kind} ${id} ${listed ? 'listed' : 'reserved'}`);
  return listCosmeticTexts();
}

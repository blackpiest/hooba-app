import type { CosmeticKind as DbCosmeticKind } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import type { AvatarBadgeCategory, AvatarCatalog, AvatarTitle } from '../avatars/avatar-catalog.js';

/** Правка значка, титула или предмета оформления из БД. null в поле — как в каталоге. */
export type CosmeticTextRow = {
  kind: DbCosmeticKind;
  itemId: string;
  name: string | null;
  description: string | null;
  category: string | null;
  /** '' — «без надписи у замка». */
  hint: string | null;
  /** Титул: значок для иконки, '' — «без иконки». */
  badge: string | null;
  /** Титул каталога скрыт владельцем. */
  hidden: boolean;
  /** Витрина (true) или запас (false) — у любого вида. */
  listed: boolean | null;
};

/** Титул, созданный владельцем (`CustomTitle`). */
export type CustomTitleRow = { id: string; label: string; badgeId: string | null; listed: boolean };

/** Всё, что владелец поменял поверх catalog.json. */
export type CosmeticEdits = { rows: CosmeticTextRow[]; customTitles: CustomTitleRow[] };

/** Категории, которые владелец может выставить. «role» не выставляется и не снимается: от неё зависит выдача ролью. */
export const EDITABLE_BADGE_CATEGORIES: readonly AvatarBadgeCategory[] = ['achievement', 'event', 'reward'];

let textsCache: Promise<CosmeticEdits> | null = null;

/** Сбросить кэш правок: владелец сохранил, вернул, создал или удалил. */
export function invalidateCosmeticTexts(): void {
  textsCache = null;
}

/**
 * Правки из БД (кэш в памяти). Без БД каталог должен работать как раньше, поэтому ошибка не пробрасывается:
 * правки просто не применяются, следующий запрос попробует снова.
 */
export function loadCosmeticTexts(): Promise<CosmeticEdits> {
  textsCache ??= Promise.all([
    prisma.cosmeticText.findMany({
      select: {
        kind: true,
        itemId: true,
        name: true,
        description: true,
        category: true,
        hint: true,
        badge: true,
        hidden: true,
        listed: true,
      },
    }),
    prisma.customTitle.findMany({
      select: { id: true, label: true, badgeId: true, listed: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ])
    .then(([rows, customTitles]) => ({ rows, customTitles }))
    .catch((error: unknown) => {
      console.error('[cosmetics] texts', error);
      textsCache = null;
      return { rows: [], customTitles: [] };
    });
  return textsCache;
}

/**
 * Каталог с правками владельца. Правка побеждает каталог, но не меняет набор значков и иконки.
 * Категорию «role» нельзя ни выставить, ни снять (сервис это проверяет; здесь — защита от старых строк).
 * Титулы: скрытые выпадают, свои дописываются в конец; значок, которого нет в каталоге, не рисуется.
 * `listed` (витрина/запас) правится у всех видов, включая рамки, фоны и персонажей.
 */
export function applyCosmeticTexts(
  catalog: AvatarCatalog,
  rows: readonly CosmeticTextRow[],
  customTitles: readonly CustomTitleRow[] = [],
): AvatarCatalog {
  if (rows.length === 0 && customTitles.length === 0) {
    return catalog;
  }
  const rowsOf = (kind: DbCosmeticKind) => new Map(rows.filter((row) => row.kind === kind).map((row) => [row.itemId, row]));
  const badgeRows = rowsOf('BADGE');
  const titleRows = rowsOf('TITLE');
  /** Рамки, фоны, персонажи: правится только `listed`. */
  const listedOf = <T extends { id: string; listed: boolean }>(kind: DbCosmeticKind, items: T[]): T[] => {
    const byId = rowsOf(kind);
    return items.map((item) => {
      const listed = byId.get(item.id)?.listed;
      return listed === null || listed === undefined || listed === item.listed ? item : { ...item, listed };
    });
  };
  const badgeIds = new Set(catalog.badges.map((badge) => badge.id));
  const titleIds = new Set(catalog.titles.map((title) => title.id));
  const withBadge = (title: AvatarTitle, badge: string | null): AvatarTitle => {
    const plain = { id: title.id, label: title.label, listed: title.listed };
    return badge && badgeIds.has(badge) ? { ...plain, badge } : plain;
  };
  return {
    ...catalog,
    characters: listedOf('CHARACTER', catalog.characters),
    backgrounds: listedOf('BACKGROUND', catalog.backgrounds),
    frames: listedOf('FRAME', catalog.frames),
    badges: catalog.badges.map((badge) => {
      const row = badgeRows.get(badge.id);
      if (!row) return badge;
      const category =
        badge.category !== 'role' && EDITABLE_BADGE_CATEGORIES.includes(row.category as AvatarBadgeCategory)
          ? (row.category as AvatarBadgeCategory)
          : badge.category;
      const hint = row.hint === null ? badge.hint : row.hint || undefined;
      return {
        ...badge,
        name: row.name ?? badge.name,
        description: row.description ?? badge.description,
        category,
        hint,
        listed: row.listed ?? badge.listed,
      };
    }),
    titles: [
      ...catalog.titles.flatMap((title) => {
        const row = titleRows.get(title.id);
        if (!row) return [title];
        if (row.hidden) return [];
        const labelled = { ...title, label: row.name || title.label, listed: row.listed ?? title.listed };
        return [withBadge(labelled, row.badge === null ? (title.badge ?? null) : row.badge)];
      }),
      ...customTitles.flatMap((custom) => {
        if (titleIds.has(custom.id)) {
          console.warn(`[cosmetics] custom title ${custom.id} shadowed by catalog`);
          return [];
        }
        return [withBadge({ id: custom.id, label: custom.label, listed: custom.listed }, custom.badgeId)];
      }),
    ],
  };
}

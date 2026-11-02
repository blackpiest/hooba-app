import type { CosmeticKind as DbCosmeticKind } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { loadAvatarCatalog, type AvatarCatalog } from '../avatars/avatar-catalog.js';

/** Вид косметики в API и в наградах испытаний. В БД — тот же набор в верхнем регистре. */
export type CosmeticKind = 'badge' | 'title' | 'frame' | 'background' | 'character';

export const COSMETIC_KINDS: readonly CosmeticKind[] = ['badge', 'title', 'frame', 'background', 'character'];

/** Рамки, фоны и персонажи открыты всем, пока не стали наградой испытания или не убраны «в запас». Значки и титулы — только выданные. */
export const LOCKABLE_KINDS: ReadonlySet<CosmeticKind> = new Set(['frame', 'background', 'character']);

export function toDbKind(kind: CosmeticKind): DbCosmeticKind {
  return kind.toUpperCase() as DbCosmeticKind;
}

export function fromDbKind(kind: DbCosmeticKind): CosmeticKind {
  return kind.toLowerCase() as CosmeticKind;
}

export function itemKey(kind: CosmeticKind, id: string): string {
  return `${kind}:${id}`;
}

export type CosmeticReward = { kind: CosmeticKind; id: string };

/**
 * Кто уже носит рамку, фон или персонажа, ставших наградой испытания или убранных «в запас», —
 * сохраняет их (`LEGACY`). Иначе публикация испытания или запас молча сняли бы косметику с участников.
 */
export async function keepForWearers(rewards: CosmeticReward[]): Promise<void> {
  const field = { frame: 'avatarFrame', background: 'avatarBackground', character: 'avatarCharacter' } as const;
  for (const reward of rewards) {
    if (!LOCKABLE_KINDS.has(reward.kind)) continue;
    const key = field[reward.kind as keyof typeof field];
    const wearers = await prisma.user.findMany({ where: { [key]: reward.id }, select: { id: true } });
    if (wearers.length > 0) {
      await prisma.userCosmetic.createMany({
        data: wearers.map((user) => ({ userId: user.id, kind: toDbKind(reward.kind), itemId: reward.id, source: 'LEGACY' as const })),
        skipDuplicates: true,
      });
    }
  }
}

/** Награды из JSON испытания; мусорные записи пропускаются (JSON проверяется при сохранении, но БД — не схема). */
export function parseRewards(raw: unknown): CosmeticReward[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const { kind, id } = item as Record<string, unknown>;
    return typeof id === 'string' && COSMETIC_KINDS.includes(kind as CosmeticKind)
      ? [{ kind: kind as CosmeticKind, id }]
      : [];
  });
}

let lockedCache: Promise<Map<string, number[]>> | null = null;

/** Сбросить кэш закрытых предметов: испытание опубликовано, изменено или архивировано. */
export function invalidateRewardLocks(): void {
  lockedCache = null;
}

/**
 * Рамки, фоны и персонажи, назначенные наградой активного или архивного испытания: их носит только тот,
 * кто заработал (или получил вручную / носил до публикации). Черновики ничего не закрывают.
 * Значение — id испытаний, которые дают предмет (активные — первыми): клиент показывает «как получить».
 */
export function rewardLockedItems(): Promise<Map<string, number[]>> {
  lockedCache ??= prisma.challenge
    .findMany({
      where: { status: { in: ['ACTIVE', 'ARCHIVED'] } },
      select: { id: true, rewards: true },
      orderBy: [{ status: 'asc' }, { id: 'asc' }],
    })
    .then((rows) => {
      const locked = new Map<string, number[]>();
      for (const row of rows) {
        for (const reward of parseRewards(row.rewards)) {
          if (LOCKABLE_KINDS.has(reward.kind)) {
            const key = itemKey(reward.kind, reward.id);
            locked.set(key, [...(locked.get(key) ?? []), row.id]);
          }
        }
      }
      return locked;
    })
    .catch((error: unknown) => {
      lockedCache = null;
      throw error;
    });
  return lockedCache;
}

export type CosmeticAccess = {
  /** Владельцу открыто всё. */
  isOwner: boolean;
  /** Записи UserCosmetic (`kind:id`). */
  owned: ReadonlySet<string>;
  /** Значки ролей пользователя. */
  roleBadges: ReadonlySet<string>;
  /** Закрытые награды испытаний: `kind:id` → id испытаний, которые их дают. */
  locked: ReadonlyMap<string, number[]>;
  /** Предметы «в запасе» (`kind:id`): рамку, фон, персонажа из запаса носит только получивший. */
  unlisted: ReadonlySet<string>;
};

/** `kind:id` всего, что владелец держит «в запасе». */
export function unlistedItems(catalog: AvatarCatalog): Set<string> {
  const lists: [CosmeticKind, { id: string; listed: boolean }[]][] = [
    ['character', catalog.characters],
    ['background', catalog.backgrounds],
    ['frame', catalog.frames],
    ['badge', catalog.badges],
    ['title', catalog.titles],
  ];
  return new Set(lists.flatMap(([kind, items]) => items.filter((item) => !item.listed).map((item) => itemKey(kind, item.id))));
}

export async function loadCosmeticAccess(userId: number): Promise<CosmeticAccess> {
  const [user, locked, catalog] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: { select: { role: { select: { key: true, badgeId: true } } } },
        cosmetics: { select: { kind: true, itemId: true } },
      },
    }),
    rewardLockedItems(),
    loadAvatarCatalog(),
  ]);
  return {
    isOwner: user?.roles.some((ur) => ur.role.key === 'OWNER') ?? false,
    owned: new Set((user?.cosmetics ?? []).map((row) => itemKey(fromDbKind(row.kind), row.itemId))),
    roleBadges: new Set((user?.roles ?? []).flatMap((ur) => (ur.role.badgeId ? [ur.role.badgeId] : []))),
    locked,
    unlisted: unlistedItems(catalog),
  };
}

/** Может ли пользователь надеть или вынести на витрину предмет. Существование id в каталоге проверяет вызывающий. */
export function canUseCosmetic(access: CosmeticAccess, kind: CosmeticKind, id: string): boolean {
  if (access.isOwner || access.owned.has(itemKey(kind, id))) {
    return true;
  }
  if (kind === 'badge') {
    return access.roleBadges.has(id);
  }
  if (kind === 'title') {
    return false;
  }
  const key = itemKey(kind, id);
  return !access.locked.has(key) && !access.unlisted.has(key);
}

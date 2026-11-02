import { useMemo } from "react";
import { create } from "zustand";
import { fetchAvatarCatalog, type AvatarCatalog, type UserAvatar } from "@/shared/api/avatars";
import type { Showcase } from "@/shared/api/badges";
import type { AvatarLook } from "@/shared/ui/avatar";
import type { BadgeSpec, ProfileCosmetics, TitleSpec } from "@/shared/ui/profile-card";
import { getSessionEpoch, registerSessionClear } from "@/shared/lib/session-reset";

type State = {
  catalog: AvatarCatalog | null;
  /** Аватары по user_id: заполняются из `/users` и `me`, патчатся событием `user:updated`. */
  avatarByUserId: Record<number, UserAvatar | null>;
  /** Витрины (закреплённые значки и титул): из `/users`, патчатся `user:updated`. */
  showcaseByUserId: Record<number, Showcase>;
  loadCatalog: () => Promise<void>;
  /** Перезапросить каталог: сменились замки (испытание опубликовано или выполнено). */
  refreshCatalog: () => Promise<void>;
  setAvatar: (userId: number, avatar: UserAvatar | null) => void;
  /** Частичное обновление: в `user:updated` приходят только изменившиеся поля. */
  setShowcase: (userId: number, patch: Partial<Showcase>) => void;
  mergeFromUsers: (
    users: { id: number; avatar: UserAvatar | null; badges?: string[]; title?: string | null }[],
  ) => void;
  clear: () => void;
};

let catalogInFlight: Promise<void> | null = null;
/** Перезапрос каталога ради незнакомой косметики — не чаще раза в 30 с (удалённый пресет не должен долбить сервер). */
const CATALOG_REFRESH_COOLDOWN_MS = 30_000;
let lastCatalogRefreshAt = 0;

function fetchCatalog(set: (patch: Pick<State, "catalog">) => void): Promise<void> {
  const epoch = getSessionEpoch();
  catalogInFlight = fetchAvatarCatalog()
    .then((catalog) => {
      if (epoch === getSessionEpoch()) {
        set({ catalog });
      }
    })
    .catch(() => {
      /* без каталога остаются буквенные аватары */
    })
    .finally(() => {
      catalogInFlight = null;
    });
  return catalogInFlight;
}

/** Косметика, которой нет в загруженном каталоге: её добавили на сервере уже после загрузки. */
export function hasUnknownCosmetics(catalog: AvatarCatalog | null, avatar: UserAvatar | null | undefined): boolean {
  if (!catalog || !avatar) {
    return false;
  }
  const missing = (list: { id: string }[], id: string | null) => id !== null && !list.some((item) => item.id === id);
  return (
    missing(catalog.characters, avatar.character) ||
    missing(catalog.backgrounds, avatar.background) ||
    missing(catalog.frames, avatar.frame)
  );
}

/** Значок или титул с витрины, которых нет в каталоге (добавлены на сервере после загрузки). */
export function hasUnknownShowcase(catalog: AvatarCatalog | null, showcase: Showcase | null | undefined): boolean {
  if (!catalog || !showcase) {
    return false;
  }
  return (
    showcase.badges.some((id) => !catalog.badges.some((item) => item.id === id)) ||
    (showcase.title !== null && !catalog.titles.some((item) => item.id === showcase.title))
  );
}

const EMPTY_SHOWCASE: Showcase = { badges: [], title: null };

function sameShowcase(a: Showcase | undefined, b: Showcase): boolean {
  return !!a && a.title === b.title && a.badges.join(",") === b.badges.join(",");
}

export const useAvatarStore = create<State>((set, get) => {
  /** Кто-то надел новую косметику — подтягиваем свежий каталог, чтобы показать её без перезагрузки. */
  function refreshIfUnknown(avatars: (UserAvatar | null)[], showcases: Showcase[] = []) {
    const { catalog } = get();
    if (catalogInFlight || Date.now() - lastCatalogRefreshAt < CATALOG_REFRESH_COOLDOWN_MS) {
      return;
    }
    if (
      avatars.some((avatar) => hasUnknownCosmetics(catalog, avatar)) ||
      showcases.some((showcase) => hasUnknownShowcase(catalog, showcase))
    ) {
      lastCatalogRefreshAt = Date.now();
      void fetchCatalog(set);
    }
  }

  return {
    catalog: null,
    avatarByUserId: {},
    showcaseByUserId: {},
    loadCatalog: () => {
      if (get().catalog) {
        return Promise.resolve();
      }
      return catalogInFlight ?? fetchCatalog(set);
    },
    refreshCatalog: () => catalogInFlight ?? fetchCatalog(set),
    setAvatar: (userId, avatar) => {
      set((s) =>
        sameAvatar(s.avatarByUserId[userId], avatar)
          ? s
          : { avatarByUserId: { ...s.avatarByUserId, [userId]: avatar } },
      );
      refreshIfUnknown([avatar]);
    },
    setShowcase: (userId, patch) => {
      const current = get().showcaseByUserId[userId] ?? EMPTY_SHOWCASE;
      const next = { ...current, ...patch };
      if (sameShowcase(get().showcaseByUserId[userId], next)) {
        return;
      }
      set((s) => ({ showcaseByUserId: { ...s.showcaseByUserId, [userId]: next } }));
      refreshIfUnknown([], [next]);
    },
    mergeFromUsers: (users) => {
      const showcases: Showcase[] = [];
      set((s) => {
        const next = { ...s.avatarByUserId };
        const nextShowcases = { ...s.showcaseByUserId };
        for (const u of users) {
          next[u.id] = u.avatar;
          const showcase = { badges: u.badges ?? [], title: u.title ?? null };
          nextShowcases[u.id] = sameShowcase(s.showcaseByUserId[u.id], showcase)
            ? (s.showcaseByUserId[u.id] ?? showcase)
            : showcase;
          showcases.push(showcase);
        }
        return { avatarByUserId: next, showcaseByUserId: nextShowcases };
      });
      refreshIfUnknown(
        users.map((u) => u.avatar),
        showcases,
      );
    },
    clear: () => set({ catalog: null, avatarByUserId: {}, showcaseByUserId: {} }),
  };
});

registerSessionClear(() => useAvatarStore.getState().clear());

export function sameAvatar(a: UserAvatar | null | undefined, b: UserAvatar | null | undefined): boolean {
  return (
    (a ?? null) === (b ?? null) ||
    (!!a && !!b && a.character === b.character && a.background === b.background && a.frame === b.frame)
  );
}

/** Маленький аватар: голова персонажа и фон. null — показываем букву на цвете бренда. */
export function resolveAvatarLook(
  catalog: AvatarCatalog | null,
  avatar: UserAvatar | null | undefined,
): AvatarLook | null {
  if (!avatar) {
    return null;
  }
  const character = avatar.character ? catalog?.characters.find((item) => item.id === avatar.character) : undefined;
  const headUrl = character?.head_url ?? null;
  const background = findById(catalog?.backgrounds, avatar.background);
  return headUrl || background ? { headUrl, background } : null;
}

export function useAvatarLook(userId: number | undefined): AvatarLook | null {
  const catalog = useAvatarStore((s) => s.catalog);
  const avatar = useAvatarStore((s) => (userId === undefined ? null : s.avatarByUserId[userId]));
  return useMemo(() => resolveAvatarLook(catalog, avatar), [catalog, avatar]);
}

function findById<T extends { id: string }>(list: T[] | undefined, id: string | null): T | null {
  return id === null ? null : (list?.find((item) => item.id === id) ?? null);
}

/** Косметика мини-профиля. Id, которого нет в каталоге (удалённый пресет, каталог ещё не загружен), — слоя нет, рамка базовая. */
export function resolveProfileCosmetics(
  catalog: AvatarCatalog | null,
  avatar: UserAvatar | null | undefined,
): ProfileCosmetics | null {
  if (!avatar) {
    return null;
  }
  const character = avatar.character ? catalog?.characters.find((item) => item.id === avatar.character) : undefined;
  return {
    frame: findById(catalog?.frames, avatar.frame),
    background: findById(catalog?.backgrounds, avatar.background),
    character: character ? { kind: "image", url: character.url, idle: character.idle ?? null } : null,
  };
}

export function useProfileCosmetics(userId: number | undefined): ProfileCosmetics | null {
  const catalog = useAvatarStore((s) => s.catalog);
  const avatar = useAvatarStore((s) => (userId === undefined ? null : s.avatarByUserId[userId]));
  return useMemo(() => resolveProfileCosmetics(catalog, avatar), [catalog, avatar]);
}

/** Витрина, разрешённая по каталогу: значки и титул, которых нет в каталоге, пропускаются. */
export type ResolvedShowcase = { badges: BadgeSpec[]; title: TitleSpec | null; titleBadge: BadgeSpec | null };

export function resolveShowcase(catalog: AvatarCatalog | null, showcase: Showcase | null | undefined): ResolvedShowcase {
  const badges = (showcase?.badges ?? []).flatMap((id) => {
    const badge = catalog?.badges.find((item) => item.id === id);
    return badge ? [badge] : [];
  });
  const title = findById(catalog?.titles, showcase?.title ?? null);
  const titleBadge = title?.badge ? findById(catalog?.badges, title.badge) : null;
  return { badges, title, titleBadge };
}

export function useShowcase(userId: number | undefined): ResolvedShowcase {
  const catalog = useAvatarStore((s) => s.catalog);
  const showcase = useAvatarStore((s) => (userId === undefined ? undefined : s.showcaseByUserId[userId]));
  return useMemo(() => resolveShowcase(catalog, showcase), [catalog, showcase]);
}

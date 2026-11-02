import { create } from "zustand";
import { displayNameOf } from "@/shared/lib/display-name";
import { registerSessionClear } from "@/shared/lib/session-reset";

/** Профильные поля участника: имена и роли. Статус/игра — `presence-store`, аватар — `avatar-store`. */
export type MemberProfile = {
  id: number;
  username: string;
  display_name: string | null;
  roles: string[];
  role_ids?: number[];
};

type State = {
  /** Заполняется из `/users` целиком, имя патчится событием `user:updated`. */
  profileByUserId: Record<number, MemberProfile>;
  setFromDirectory: (users: MemberProfile[]) => void;
  setDisplayName: (userId: number, displayName: string | null) => void;
  /** Ответ assign/remove: роли меняются сразу, не дожидаясь перезагрузки списка. */
  setRoles: (userId: number, roles: string[], roleIds: number[]) => void;
  clear: () => void;
};

export const useMemberProfileStore = create<State>((set) => ({
  profileByUserId: {},
  setFromDirectory: (users) =>
    set({
      profileByUserId: Object.fromEntries(
        users.map((u) => [
          u.id,
          { id: u.id, username: u.username, display_name: u.display_name, roles: u.roles, role_ids: u.role_ids },
        ]),
      ),
    }),
  setDisplayName: (userId, displayName) =>
    set((s) => {
      const current = s.profileByUserId[userId];
      if (!current || current.display_name === displayName) {
        return s;
      }
      return { profileByUserId: { ...s.profileByUserId, [userId]: { ...current, display_name: displayName } } };
    }),
  setRoles: (userId, roles, roleIds) =>
    set((s) => {
      const current = s.profileByUserId[userId];
      if (!current) {
        return s;
      }
      return { profileByUserId: { ...s.profileByUserId, [userId]: { ...current, roles, role_ids: roleIds } } };
    }),
  clear: () => set({ profileByUserId: {} }),
}));

registerSessionClear(() => useMemberProfileStore.getState().clear());

export function useMemberProfile(userId: number | null | undefined): MemberProfile | null {
  return useMemberProfileStore((s) => (userId == null ? null : (s.profileByUserId[userId] ?? null)));
}

/** `fallback` — имя из самого события/сообщения: для тех, кого нет в списке участников (исключён). */
export function useDisplayName(userId: number | null | undefined, fallback: string): string {
  const profile = useMemberProfile(userId);
  return profile ? displayNameOf(profile) : fallback;
}

import { create } from "zustand";
import { fetchRoles, type RoleRow } from "@/shared/api/roles";
import { getSessionEpoch, registerSessionClear } from "@/shared/lib/session-reset";

type State = {
  /** Каталог ролей в порядке приоритета (сервер уже отсортировал по position, MEMBER — последней). */
  roles: RoleRow[];
  loaded: boolean;
  load: () => Promise<void>;
  setRoles: (roles: RoleRow[]) => void;
  /** Локально применяет ответ мутации; свежий каталог всё равно придёт по `roles:changed`. */
  upsertRole: (role: RoleRow) => void;
  removeRole: (roleId: number) => void;
  clear: () => void;
};

let loadSeq = 0;

export const useRoleStore = create<State>((set) => ({
  roles: [],
  loaded: false,
  load: async () => {
    const seq = ++loadSeq;
    const epoch = getSessionEpoch();
    try {
      const roles = await fetchRoles();
      if (seq === loadSeq && epoch === getSessionEpoch()) {
        set({ roles, loaded: true });
      }
    } catch {
      /* без каталога бейджи ролей не показываются */
    }
  },
  setRoles: (roles) => {
    ++loadSeq;
    set({ roles, loaded: true });
  },
  upsertRole: (role) => {
    ++loadSeq;
    set((s) => {
      if (s.roles.some((item) => item.id === role.id)) {
        return { roles: s.roles.map((item) => (item.id === role.id ? role : item)) };
      }
      // MEMBER всегда последняя: новая роль встаёт перед ней.
      const memberIndex = s.roles.findIndex((item) => item.key === "MEMBER");
      const next = [...s.roles];
      next.splice(memberIndex < 0 ? next.length : memberIndex, 0, role);
      return { roles: next };
    });
  },
  removeRole: (roleId) => {
    ++loadSeq;
    set((s) => ({ roles: s.roles.filter((item) => item.id !== roleId) }));
  },
  clear: () => {
    ++loadSeq;
    set({ roles: [], loaded: false });
  },
}));

registerSessionClear(() => useRoleStore.getState().clear());

/** Роли участника в порядке каталога. */
export function rolesOf(catalog: readonly RoleRow[], roleIds: readonly number[] | undefined): RoleRow[] {
  if (!roleIds || roleIds.length === 0) {
    return [];
  }
  const owned = new Set(roleIds);
  return catalog.filter((role) => owned.has(role.id));
}

/**
 * В какой группе «Онлайн» показывать участника: самая приоритетная (первая в каталоге) из его ролей
 * с `hoist`. null — в общей группе.
 */
export function memberGroupRole(catalog: readonly RoleRow[], roleIds: readonly number[] | undefined): RoleRow | null {
  return rolesOf(catalog, roleIds).find((role) => role.hoist && role.key !== "MEMBER") ?? null;
}

/** Каталог в новом порядке: `orderedIds` — все роли, кроме MEMBER; MEMBER остаётся последней. */
export function applyRoleOrder(catalog: readonly RoleRow[], orderedIds: readonly number[]): RoleRow[] {
  const byId = new Map(catalog.map((role) => [role.id, role]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((role): role is RoleRow => role !== undefined);
  const placed = new Set(orderedIds);
  return [...ordered, ...catalog.filter((role) => !placed.has(role.id))];
}

/**
 * Какими ролями владелец может управлять у участника (зеркало правил сервера, `roles.service`):
 * кастомные — всем; ADMIN — всем, кроме себя и владельца. OWNER и MEMBER не выдаются и не снимаются.
 */
export function manageableRoles(
  catalog: readonly RoleRow[],
  target: { isSelf: boolean; roleKeys: readonly string[] },
): { admin: RoleRow | null; custom: RoleRow[] } {
  const adminAllowed = !target.isSelf && !target.roleKeys.includes("OWNER");
  return {
    admin: adminAllowed ? (catalog.find((role) => role.key === "ADMIN") ?? null) : null,
    custom: catalog.filter((role) => role.key === null),
  };
}

import { create } from "zustand";
import type { PresencePreference, PublicPresenceStatus } from "@/shared/presence";
import { registerSessionClear } from "@/shared/lib/session-reset";

type State = {
  statusByUserId: Record<number, PublicPresenceStatus>;
  gameByUserId: Record<number, string | null>;
  selfPreference: PresencePreference;
  setStatus: (userId: number, status: PublicPresenceStatus) => void;
  setGame: (userId: number, game: string | null) => void;
  setSelfPreference: (value: PresencePreference) => void;
  mergeFromUsers: (users: { id: number; status: PublicPresenceStatus; game?: string | null }[]) => void;
  clear: () => void;
};

export const usePresenceStore = create<State>((set) => ({
  statusByUserId: {},
  gameByUserId: {},
  selfPreference: "online",
  setStatus: (userId, status) =>
    set((s) =>
      s.statusByUserId[userId] === status
        ? s
        : { statusByUserId: { ...s.statusByUserId, [userId]: status } },
    ),
  setGame: (userId, game) =>
    set((s) =>
      s.gameByUserId[userId] === game ? s : { gameByUserId: { ...s.gameByUserId, [userId]: game } },
    ),
  setSelfPreference: (value) =>
    set((s) => (s.selfPreference === value ? s : { selfPreference: value })),
  mergeFromUsers: (users) =>
    set((s) => {
      const nextStatus = { ...s.statusByUserId };
      const nextGame = { ...s.gameByUserId };
      for (const u of users) {
        nextStatus[u.id] = u.status;
        if ("game" in u) {
          nextGame[u.id] = u.game ?? null;
        }
      }
      return { statusByUserId: nextStatus, gameByUserId: nextGame };
    }),
  clear: () => set({ statusByUserId: {}, gameByUserId: {}, selfPreference: "online" }),
}));

registerSessionClear(() => usePresenceStore.getState().clear());

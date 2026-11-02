import { create } from "zustand";
import { fetchMyOpenReportTargets, fetchOpenReportsCount } from "@/shared/api/reports";
import { getSessionEpoch, registerSessionClear } from "@/shared/lib/session-reset";

type State = {
  /** Цели моих открытых жалоб: на них повторно пожаловаться нельзя, пока админ не рассмотрит. */
  reportedIds: ReadonlySet<number>;
  /** Открытые жалобы на сервере — только для staff (иначе 0). */
  openCount: number;
  /** Бамп при любом изменении — панель жалоб перечитывает список. */
  revision: number;
  loadMine: () => Promise<void>;
  loadOpenCount: () => Promise<void>;
  markReported: (userId: number) => void;
  unmarkReported: (userId: number) => void;
  setOpenCount: (count: number) => void;
  clear: () => void;
};

export const useReportStore = create<State>((set) => ({
  reportedIds: new Set<number>(),
  openCount: 0,
  revision: 0,
  loadMine: async () => {
    const epoch = getSessionEpoch();
    try {
      const ids = await fetchMyOpenReportTargets();
      if (epoch === getSessionEpoch()) {
        set({ reportedIds: new Set(ids) });
      }
    } catch {
      /* без списка пункт «Пожаловаться» остаётся доступным, сервер всё равно отклонит дубль */
    }
  },
  loadOpenCount: async () => {
    const epoch = getSessionEpoch();
    try {
      const count = await fetchOpenReportsCount();
      if (epoch === getSessionEpoch()) {
        set({ openCount: count });
      }
    } catch {
      /* счётчик не критичен */
    }
  },
  markReported: (userId) =>
    set((s) => ({ reportedIds: new Set(s.reportedIds).add(userId) })),
  unmarkReported: (userId) =>
    set((s) => {
      const next = new Set(s.reportedIds);
      next.delete(userId);
      return { reportedIds: next };
    }),
  setOpenCount: (count) => set((s) => ({ openCount: count, revision: s.revision + 1 })),
  clear: () => set({ reportedIds: new Set<number>(), openCount: 0, revision: 0 }),
}));

registerSessionClear(() => useReportStore.getState().clear());

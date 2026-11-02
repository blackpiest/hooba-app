import { create } from "zustand";
import { fetchPendingAnnouncements, markAnnouncementSeen, type PendingAnnouncement } from "@/shared/api/announcements";
import { getSessionEpoch, registerSessionClear } from "@/shared/lib/session-reset";

type State = {
  /** Непрочитанные объявления по порядку показа; модалка показывает первое. */
  queue: PendingAnnouncement[];
  load: () => Promise<void>;
  /** Закрыл модалку: убрать из очереди и отметить на сервере. */
  dismiss: (id: number) => void;
  clear: () => void;
};

export const useAnnouncementStore = create<State>((set) => ({
  queue: [],
  load: async () => {
    const epoch = getSessionEpoch();
    try {
      const rows = await fetchPendingAnnouncements();
      if (epoch === getSessionEpoch()) {
        set({ queue: rows });
      }
    } catch {
      /* не критично: покажем при следующем входе или событии */
    }
  },
  dismiss: (id) => {
    set((s) => ({ queue: s.queue.filter((item) => item.id !== id) }));
    // Не дошло — объявление вернётся при следующей загрузке очереди.
    void markAnnouncementSeen(id).catch(() => undefined);
  },
  clear: () => set({ queue: [] }),
}));

registerSessionClear(() => useAnnouncementStore.getState().clear());

import { create } from "zustand";
import { fetchProfileNews, markProfileNewsSeen, type ProfileNews } from "@/shared/api/profile-news";
import { getSessionEpoch, registerSessionClear } from "@/shared/lib/session-reset";

type State = {
  /** Новинки конструктора профиля; null — ещё не загружены или нечего показать. */
  news: ProfileNews | null;
  /** Новинки хотя бы раз загружены: до этого «нечего показать» не известно наверняка. */
  loaded: boolean;
  load: () => Promise<void>;
  /** Открыл конструктор или отмахнулся от подсказки: скрыть сразу и отметить на сервере. */
  markSeen: () => void;
  clear: () => void;
};

export function hasProfileNews(news: ProfileNews | null): news is ProfileNews {
  return !!news && (news.cosmetics > 0 || news.challenges > 0 || news.completed_count > 0);
}

/** Растёт на каждой отметке «просмотрено»: ответ загрузки, начатой раньше, устарел и не должен вернуть подсказку. */
let seenSeq = 0;

export const useProfileNewsStore = create<State>((set, get) => ({
  news: null,
  loaded: false,
  load: async () => {
    const epoch = getSessionEpoch();
    const seq = seenSeq;
    try {
      const news = await fetchProfileNews();
      if (epoch === getSessionEpoch() && seq === seenSeq) {
        set({ news, loaded: true });
      }
    } catch {
      /* не критично: покажем при следующем входе или событии */
    }
  },
  markSeen: () => {
    // Загружено и пусто — отмечать нечего. Не загружено — отмечаем: иначе подсказка всплывёт уже после просмотра.
    if (get().loaded && !hasProfileNews(get().news)) {
      return;
    }
    seenSeq += 1;
    set({ news: null });
    // Не дошло — подсказка вернётся при следующей загрузке.
    void markProfileNewsSeen().catch(() => undefined);
  },
  clear: () => {
    seenSeq += 1;
    set({ news: null, loaded: false });
  },
}));

registerSessionClear(() => useProfileNewsStore.getState().clear());

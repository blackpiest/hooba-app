import { create } from "zustand";
import { fetchMyChallenges, type MyChallenge } from "@/shared/api/challenges";
import { getSessionEpoch, registerSessionClear } from "@/shared/lib/session-reset";

type State = {
  /** Мои испытания: активные с прогрессом и выполненные архивные. null — ещё не загружены. */
  mine: MyChallenge[] | null;
  failed: boolean;
  /** Перезапросить (прогресс меняется постоянно, поэтому без кэша: при открытии вкладки и по событиям). */
  load: () => Promise<void>;
  clear: () => void;
};

let inFlight: Promise<void> | null = null;

export const useChallengeStore = create<State>((set) => ({
  mine: null,
  failed: false,
  load: () => {
    if (inFlight) return inFlight;
    const epoch = getSessionEpoch();
    inFlight = fetchMyChallenges()
      .then((mine) => {
        if (epoch === getSessionEpoch()) set({ mine, failed: false });
      })
      .catch(() => {
        if (epoch === getSessionEpoch()) set({ failed: true });
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },
  clear: () => set({ mine: null, failed: false }),
}));

registerSessionClear(() => useChallengeStore.getState().clear());

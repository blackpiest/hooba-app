import { create } from 'zustand';
import { fetchMe as fetchMeApi, type MeResponse } from '@/shared/api/auth';
import { getSessionEpoch, registerSessionClear } from '@/shared/lib/session-reset';

type UserStore = {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  setMe: (me: MeResponse | null) => void;
  fetchMe: (opts?: { force?: boolean }) => Promise<MeResponse | null>;
  clear: () => void;
};

let meInFlight: Promise<MeResponse | null> | null = null;
let meInFlightEpoch = -1;

function hasAdminRole(me: MeResponse | null): boolean {
  return me?.roles.some((role) => role === 'OWNER' || role === 'ADMIN') ?? false;
}

export const useUserStore = create<UserStore>((set, get) => ({
  me: null,
  loading: false,
  error: null,
  isAdmin: false,
  setMe: (me) => set({ me, isAdmin: hasAdminRole(me), error: null }),
  fetchMe: async (opts) => {
    if (!opts?.force && get().me) {
      return get().me;
    }
    const sessionEpoch = getSessionEpoch();
    if (meInFlight && meInFlightEpoch === sessionEpoch) {
      return meInFlight;
    }

    meInFlightEpoch = sessionEpoch;
    meInFlight = (async () => {
      set({ loading: true, error: null });
      try {
        const me = await fetchMeApi();
        if (sessionEpoch !== getSessionEpoch()) {
          return null;
        }
        set({ me, isAdmin: hasAdminRole(me), loading: false, error: null });
        return me;
      } catch (e: unknown) {
        if (sessionEpoch !== getSessionEpoch()) {
          return null;
        }
        set({
          me: null,
          isAdmin: false,
          loading: false,
          error: e instanceof Error ? e.message : 'Ошибка загрузки пользователя',
        });
        return null;
      } finally {
        if (meInFlightEpoch === sessionEpoch) {
          meInFlight = null;
        }
      }
    })();

    return meInFlight;
  },
  clear: () => set({ me: null, loading: false, error: null, isAdmin: false }),
}));

registerSessionClear(() => useUserStore.getState().clear());

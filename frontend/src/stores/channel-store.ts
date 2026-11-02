import { create } from 'zustand';
import { fetchChannels as fetchChannelsApi, type ChannelDto } from '../shared/api/channels';
import { getSessionEpoch, registerSessionClear } from '../shared/lib/session-reset';

type ChannelStore = {
  channels: ChannelDto[];
  loading: boolean;
  /** Список хотя бы раз успешно загружен. */
  loaded: boolean;
  error: string | null;
  fetchChannels: (opts?: { force?: boolean }) => Promise<void>;
  setChannels: (list: ChannelDto[]) => void;
};

/** Переставляет каналы одного типа на их местах в общем списке. Чужой набор id оставляет список как был. */
export function applyChannelTypeOrder(
  channels: ChannelDto[],
  channelType: string,
  orderedIds: number[],
): ChannelDto[] {
  const current = channels.filter((channel) => channel.channel_type === channelType);
  if (current.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) {
    return channels;
  }
  const byId = new Map(current.map((channel) => [channel.id, channel]));
  const nextOfType: ChannelDto[] = [];
  for (let index = 0; index < orderedIds.length; index += 1) {
    const row = byId.get(orderedIds[index] ?? -1);
    if (!row) {
      return channels;
    }
    nextOfType.push({ ...row, position: index });
  }
  let cursor = 0;
  return channels.map((channel) =>
    channel.channel_type === channelType ? (nextOfType[cursor++] as ChannelDto) : channel,
  );
}

let channelsListInFlight: Promise<void> | null = null;
let channelsListLastSuccessAt = 0;
let channelsListEpoch = 0;

export const useChannelStore = create<ChannelStore>((set, get) => ({
  channels: [],
  loading: false,
  loaded: false,
  error: null,
  setChannels: (list) => {
    channelsListEpoch += 1;
    set({ channels: list });
  },
  fetchChannels: async (opts) => {
    if (channelsListInFlight && !opts?.force) {
      await channelsListInFlight;
      return;
    }
    const now = Date.now();
    if (
      !opts?.force &&
      now - channelsListLastSuccessAt < 2000 &&
      (get().channels.length > 0 || channelsListLastSuccessAt > 0)
    ) {
      return;
    }
    const epoch = ++channelsListEpoch;
    const sessionEpoch = getSessionEpoch();
    const flight: { run: Promise<void> | null } = { run: null };
    const run = (async () => {
      set({ loading: true, error: null });
      try {
        const list = await fetchChannelsApi();
        if (epoch !== channelsListEpoch || sessionEpoch !== getSessionEpoch()) {
          if (channelsListInFlight === flight.run && sessionEpoch === getSessionEpoch()) {
            set({ loading: false });
          }
          return;
        }
        channelsListLastSuccessAt = Date.now();
        set({ channels: list, loading: false, loaded: true, error: null });
      } catch (e: unknown) {
        if (epoch !== channelsListEpoch || sessionEpoch !== getSessionEpoch()) {
          if (channelsListInFlight === flight.run && sessionEpoch === getSessionEpoch()) {
            set({ loading: false });
          }
          return;
        }
        set({
          error: e instanceof Error ? e.message : 'Ошибка загрузки каналов',
          loading: false,
        });
      }
    })();
    flight.run = run;
    channelsListInFlight = run;
    try {
      await run;
    } finally {
      if (channelsListInFlight === run) {
        channelsListInFlight = null;
      }
    }
  },
}));

export function resetChannelStore(): void {
  channelsListEpoch += 1;
  channelsListLastSuccessAt = 0;
  channelsListInFlight = null;
  useChannelStore.setState({ channels: [], loading: false, loaded: false, error: null });
}

registerSessionClear(resetChannelStore);

import { create } from "zustand";
import { registerSessionClear } from "@/shared/lib/session-reset";
import type { ScreenShareQuality, ScreenShareSurface } from "./screen-share-profiles";

export type ScreenSharePresentation = "stage" | "pip";

export type ScreenShareHostView = "closed" | ScreenSharePresentation;

/** Что ведущий выбрал при старте: подпись в его превью. */
export type ScreenShareHostInfo = {
  quality: ScreenShareQuality;
  surface: ScreenShareSurface;
  sourceLabel: string | null;
  hasAudio: boolean;
};

type ScreenShareStore = {
  hosting: boolean;
  hostChannelId: number | null;
  hostInfo: ScreenShareHostInfo | null;
  hostView: ScreenShareHostView;
  hostAudioMuted: boolean;
  startOpen: boolean;
  watchingChannelId: number | null;
  presentation: ScreenSharePresentation;
  watchError: string | null;
  soundMuted: boolean;
  hasWatchAudio: boolean;
  pendingVoiceSwitchId: number | null;
  watchAfterSwitch: boolean;
  pendingWatchSwitchId: number | null;
  openStart: () => void;
  closeStart: () => void;
  setHosting: (channelId: number | null, info?: ScreenShareHostInfo) => void;
  openHostView: (view: ScreenSharePresentation) => void;
  setHostAudioMuted: (muted: boolean) => void;
  setWatching: (channelId: number | null) => void;
  collapseToPip: () => void;
  expandToStage: () => void;
  setWatchError: (error: string | null) => void;
  setSoundMuted: (muted: boolean) => void;
  setHasWatchAudio: (hasAudio: boolean) => void;
  requestVoiceSwitch: (channelId: number, watchAfter?: boolean) => void;
  clearVoiceSwitch: () => void;
  requestWatchSwitch: (channelId: number) => void;
  clearWatchSwitch: () => void;
  resetSession: () => void;
};

const NO_HOST = {
  hosting: false,
  hostChannelId: null,
  hostInfo: null,
  hostView: "closed",
  hostAudioMuted: false,
} as const;

export const useScreenShareStore = create<ScreenShareStore>((set) => ({
  ...NO_HOST,
  startOpen: false,
  watchingChannelId: null,
  presentation: "stage",
  watchError: null,
  soundMuted: false,
  hasWatchAudio: false,
  pendingVoiceSwitchId: null,
  watchAfterSwitch: false,
  pendingWatchSwitchId: null,
  openStart: () => set({ startOpen: true }),
  closeStart: () => set({ startOpen: false }),
  /** Конец показа любым путём (кнопка, системная остановка, выход из голоса) закрывает и превью ведущего. */
  setHosting: (channelId, info) =>
    set((state) => {
      if (channelId == null) {
        return NO_HOST;
      }
      if (state.hostChannelId === channelId && info == null) {
        return state;
      }
      return {
        hosting: true,
        hostChannelId: channelId,
        hostInfo: info ?? state.hostInfo,
        hostView: "pip",
        hostAudioMuted: false,
      };
    }),
  openHostView: (view) => set((state) => (state.hosting ? { hostView: view } : state)),
  setHostAudioMuted: (muted) => set({ hostAudioMuted: muted }),
  setWatching: (channelId) =>
    set({
      watchingChannelId: channelId,
      presentation: "stage",
      watchError: null,
      hasWatchAudio: false,
    }),
  collapseToPip: () =>
    set((state) => {
      if (state.hostView === "stage") {
        return { hostView: "pip" };
      }
      return state.watchingChannelId == null || state.presentation === "pip" ? state : { presentation: "pip" };
    }),
  expandToStage: () =>
    set((state) => (state.watchingChannelId == null ? state : { presentation: "stage" })),
  setWatchError: (error) => set({ watchError: error }),
  setSoundMuted: (muted) => set({ soundMuted: muted }),
  setHasWatchAudio: (hasAudio) => set({ hasWatchAudio: hasAudio }),
  requestVoiceSwitch: (channelId, watchAfter = false) =>
    set({ pendingVoiceSwitchId: channelId, watchAfterSwitch: watchAfter }),
  clearVoiceSwitch: () => set({ pendingVoiceSwitchId: null, watchAfterSwitch: false }),
  requestWatchSwitch: (channelId) => set({ pendingWatchSwitchId: channelId }),
  clearWatchSwitch: () => set({ pendingWatchSwitchId: null }),
  resetSession: () =>
    set({
      ...NO_HOST,
      watchingChannelId: null,
      presentation: "stage",
      watchError: null,
      hasWatchAudio: false,
      pendingVoiceSwitchId: null,
      watchAfterSwitch: false,
      pendingWatchSwitchId: null,
    }),
}));

registerSessionClear(() => useScreenShareStore.getState().resetSession());

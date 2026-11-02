import { create } from "zustand";
import {
  loadVoiceDevicePrefs,
  saveVoiceDevicePrefs,
} from "@/shared/lib/voice-device-prefs";
import {
  getVoiceActivationMode,
  setVoiceActivationMode as saveVoiceActivationMode,
  type VoiceActivationMode,
} from "@/shared/lib/voice-activation-prefs";
import { registerSessionClear } from "@/shared/lib/session-reset";
import { syncDesktopPushToTalk } from "@/features/voice/ptt-state";
import {
  getVoiceCaptureMode,
  setVoiceCaptureMode as saveVoiceCaptureMode,
  type VoiceCaptureMode,
} from "@/shared/lib/voice-processing-prefs";
import {
  getInputVolume,
  getOutputVolume,
  setInputVolume as saveInputVolume,
  setOutputVolume as saveOutputVolume,
} from "@/shared/lib/voice-volume-prefs";
import type {
  VoiceMediaDebug,
  VoiceMediasoupHandle,
} from "../webrtc-voice.types";

/** Синхронный доступ при async voice:joined (до обновления React state). */
let inputDeviceIdRef = "";
let outputDeviceIdRef = "";
let mediasoupHandle: VoiceMediasoupHandle | null = null;
let debugInterval: ReturnType<typeof setInterval> | null = null;

function stopDebugPolling() {
  if (debugInterval) {
    clearInterval(debugInterval);
    debugInterval = null;
  }
}

function startDebugPolling(onTick: () => void) {
  stopDebugPolling();
  debugInterval = setInterval(onTick, 900);
}

export function getVoiceDeviceIds(): {
  inputDeviceId: string;
  outputDeviceId: string;
} {
  return {
    inputDeviceId: inputDeviceIdRef,
    outputDeviceId: outputDeviceIdRef,
  };
}

export function getVoiceMediasoupHandle(): VoiceMediasoupHandle | null {
  return mediasoupHandle;
}

type VoiceSettingsState = {
  isOpen: boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  captureMode: VoiceCaptureMode;
  activationMode: VoiceActivationMode;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  mediaDebug: VoiceMediaDebug | null;
  deviceError: string | null;
  /** Скрыть WebRTC debug (SFU недоступен и т.п.). */
  hideDebug: boolean;
  /** Растёт при каждом новом handle: подписчики (просмотр трансляции) перепривязываются после переподключения. */
  mediasoupEpoch: number;
};

type VoiceSettingsActions = {
  open: () => void;
  setOpen: (open: boolean) => void;
  hydrateFromStorage: () => void;
  refreshDevices: () => Promise<void>;
  setInputDeviceId: (id: string) => void;
  setOutputDeviceId: (id: string) => void;
  setInputVolume: (percent: number) => void;
  setOutputVolume: (percent: number) => void;
  setCaptureMode: (mode: VoiceCaptureMode) => void;
  setActivationMode: (mode: VoiceActivationMode) => void;
  setMediasoupHandle: (handle: VoiceMediasoupHandle | null) => void;
  setHideDebug: (hide: boolean) => void;
};

function reacquireMic(
  set: (partial: Partial<VoiceSettingsState>) => void,
  revert: () => void,
  fallback: string,
): void {
  void (async () => {
    if (!mediasoupHandle) {
      return;
    }
    try {
      await mediasoupHandle.replaceInputDevice(inputDeviceIdRef || null);
      set({ deviceError: null });
    } catch (err) {
      revert();
      set({
        captureMode: getVoiceCaptureMode(),
        activationMode: getVoiceActivationMode(),
        deviceError: err instanceof Error ? err.message : fallback,
      });
    }
  })();
}

export const useVoiceSettingsStore = create<
  VoiceSettingsState & VoiceSettingsActions
>((set, get) => ({
  isOpen: false,
  inputDeviceId: "",
  outputDeviceId: "",
  inputVolume: getInputVolume(),
  outputVolume: getOutputVolume(),
  captureMode: getVoiceCaptureMode(),
  activationMode: getVoiceActivationMode(),
  audioInputDevices: [],
  audioOutputDevices: [],
  mediaDebug: null,
  deviceError: null,
  hideDebug: false,
  mediasoupEpoch: 0,

  open: () => set({ isOpen: true }),
  setOpen: (open) => set({ isOpen: open }),

  hydrateFromStorage: () => {
    const p = loadVoiceDevicePrefs();
    const inId = p.inputDeviceId ?? "";
    const outId = p.outputDeviceId ?? "";
    inputDeviceIdRef = inId;
    outputDeviceIdRef = outId;
    set({
      inputDeviceId: inId,
      outputDeviceId: outId,
      inputVolume: getInputVolume(),
      outputVolume: getOutputVolume(),
      captureMode: getVoiceCaptureMode(),
      activationMode: getVoiceActivationMode(),
    });
  },

  refreshDevices: async () => {
    const md =
      typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.enumerateDevices) {
      return;
    }
    try {
      const all = await md.enumerateDevices();
      set({
        audioInputDevices: all.filter((d) => d.kind === "audioinput"),
        audioOutputDevices: all.filter((d) => d.kind === "audiooutput"),
      });
    } catch {
      /* нет прав */
    }
  },

  setInputDeviceId: (id) => {
    inputDeviceIdRef = id;
    set({ inputDeviceId: id });
    saveVoiceDevicePrefs({
      inputDeviceId: id || undefined,
      outputDeviceId: outputDeviceIdRef || undefined,
    });
    void (async () => {
      if (!mediasoupHandle) {
        return;
      }
      try {
        await mediasoupHandle.replaceInputDevice(id || null);
        set({ deviceError: null });
      } catch (err) {
        set({
          deviceError:
            err instanceof Error ? err.message : "Ошибка смены микрофона",
        });
      }
    })();
  },

  setOutputDeviceId: (id) => {
    outputDeviceIdRef = id;
    set({ outputDeviceId: id });
    saveVoiceDevicePrefs({
      inputDeviceId: inputDeviceIdRef || undefined,
      outputDeviceId: id || undefined,
    });
    void (async () => {
      if (!mediasoupHandle) {
        return;
      }
      try {
        await mediasoupHandle.setOutputDevice(id || null);
        set({ deviceError: null });
      } catch {
        /* setSinkId */
      }
    })();
  },

  setInputVolume: (percent) => {
    saveInputVolume(percent);
    set({ inputVolume: getInputVolume() });
  },

  setOutputVolume: (percent) => {
    saveOutputVolume(percent);
    set({ outputVolume: getOutputVolume() });
  },

  setCaptureMode: (mode) => {
    const previous = getVoiceCaptureMode();
    saveVoiceCaptureMode(mode);
    set({ captureMode: getVoiceCaptureMode() });
    reacquireMic(set, () => {
      saveVoiceCaptureMode(previous);
    }, "Не удалось применить обработку микрофона");
  },

  setActivationMode: (mode) => {
    const previous = getVoiceActivationMode();
    if (mode === previous) {
      return;
    }
    saveVoiceActivationMode(mode);
    set({ activationMode: getVoiceActivationMode() });
    void syncDesktopPushToTalk();
    reacquireMic(set, () => {
      saveVoiceActivationMode(previous);
      void syncDesktopPushToTalk();
    }, "Не удалось переключить активацию микрофона");
  },

  setMediasoupHandle: (handle) => {
    const changed = handle !== mediasoupHandle;
    mediasoupHandle = handle;
    stopDebugPolling();
    if (handle && changed) {
      set({ mediasoupEpoch: get().mediasoupEpoch + 1 });
    }
    if (handle) {
      set({ mediaDebug: handle.getMediaDebug() });
      startDebugPolling(() => {
        if (mediasoupHandle) {
          set({ mediaDebug: mediasoupHandle.getMediaDebug() });
        }
      });
      void get().refreshDevices();
    } else {
      set({ mediaDebug: null });
    }
  },

  setHideDebug: (hide) => set({ hideDebug: hide }),
}));

/** Подтянуть mediasoup/debug в store, если сессия уже активна. */
export function syncVoiceSettingsFromActiveSession(): void {
  const h = getVoiceMediasoupHandle();
  if (!h) {
    return;
  }
  const store = useVoiceSettingsStore.getState();
  store.setHideDebug(false);
  store.setMediasoupHandle(h);
}

// Настройки устройств и громкость — префы браузера (не сессии), сбрасываем только UI-состояние модалки.
registerSessionClear(() =>
  useVoiceSettingsStore.setState({
    isOpen: false,
    mediaDebug: null,
    deviceError: null,
    hideDebug: false,
  }),
);

/** Открыть модалку из любого места /app. */
export function openVoiceSettings(): void {
  syncVoiceSettingsFromActiveSession();
  useVoiceSettingsStore.getState().open();
}

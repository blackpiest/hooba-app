import deafenSoundUrl from "@/assets/sounds/deafen.wav";
import muteSoundUrl from "@/assets/sounds/mic-mute.wav";
import streamEndSoundUrl from "@/assets/sounds/stream-end.wav";
import streamJoinSoundUrl from "@/assets/sounds/stream-join.wav";
import streamLeaveSoundUrl from "@/assets/sounds/stream-leave.wav";
import streamStartSoundUrl from "@/assets/sounds/stream-start.wav";
import undeafenSoundUrl from "@/assets/sounds/undeafen.wav";
import unmuteSoundUrl from "@/assets/sounds/mic-unmute.wav";
import joinSoundUrl from "@/assets/sounds/voice-join.wav";
import leaveSoundUrl from "@/assets/sounds/voice-leave.wav";
import { useUserStore } from "@/stores/user-store";
import { useVoiceStore } from "@/stores/voice-store";
import { getOutputVolume, volumeToGain } from "@/shared/lib/voice-volume-prefs";
import { getVoiceDeviceIds } from "./voice-settings/voice-settings";
import { isTouchInput } from "@/hooks/use-breakpoint";
import { playTouchClip } from "./touch-sound-player";

type AudioWithSink = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

let lastJoinAt = 0;
let lastLeaveAt = 0;
let lastMuteAt = 0;
let lastUnmuteAt = 0;
let lastDeafenAt = 0;
let lastUndeafenAt = 0;

const MIN_INTERVAL_MS = 180;
const PLAYBACK_VOLUME = 0.45;

async function applyOutputSink(el: HTMLAudioElement): Promise<void> {
  const { outputDeviceId } = getVoiceDeviceIds();
  const sink = outputDeviceId || "";
  const anyEl = el as AudioWithSink;
  if (typeof anyEl.setSinkId !== "function") {
    return;
  }
  try {
    await anyEl.setSinkId(sink);
  } catch {
    /* устройство недоступно */
  }
}

export async function playClip(soundUrl: string, volume = 1): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  const level = Math.min(1, PLAYBACK_VOLUME * volume * volumeToGain(getOutputVolume()));
  // Телефон: общий Web Audio контекст — без отказов Safari и без разброса задержки старта (эхо).
  if (isTouchInput()) {
    await playTouchClip(soundUrl, level);
    return;
  }
  const el = new Audio(soundUrl);
  el.volume = level;
  await applyOutputSink(el);
  try {
    await el.play();
  } catch {
    /* autoplay до первого жеста */
  }
}

/** Зацикленный клип (фоновая музыка) с громкостью вывода пользователя. Возвращает функцию остановки. */
export function createLoopingClip(soundUrl: string, volume = 1): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const el = new Audio(soundUrl);
  el.loop = true;
  el.volume = Math.min(1, PLAYBACK_VOLUME * volume * volumeToGain(getOutputVolume()));
  let stopped = false;
  void applyOutputSink(el).then(async () => {
    if (stopped) {
      return;
    }
    try {
      await el.play();
    } catch {
      /* autoplay до первого жеста */
    }
  });
  return () => {
    stopped = true;
    el.pause();
    el.removeAttribute("src");
    el.load();
  };
}

export function playVoiceMemberJoinedSound(): void {
  const now = Date.now();
  if (now - lastJoinAt < MIN_INTERVAL_MS) {
    return;
  }
  lastJoinAt = now;
  void playClip(joinSoundUrl);
}

export function playVoiceMemberLeftSound(): void {
  const now = Date.now();
  if (now - lastLeaveAt < MIN_INTERVAL_MS) {
    return;
  }
  lastLeaveAt = now;
  void playClip(leaveSoundUrl);
}

export function playVoiceMutedSound(): void {
  const now = Date.now();
  if (now - lastMuteAt < MIN_INTERVAL_MS) {
    return;
  }
  lastMuteAt = now;
  void playClip(muteSoundUrl);
}

export function playVoiceUnmutedSound(): void {
  const now = Date.now();
  if (now - lastUnmuteAt < MIN_INTERVAL_MS) {
    return;
  }
  lastUnmuteAt = now;
  void playClip(unmuteSoundUrl);
}

export function playVoiceDeafenedSound(): void {
  const now = Date.now();
  if (now - lastDeafenAt < MIN_INTERVAL_MS) {
    return;
  }
  lastDeafenAt = now;
  void playClip(deafenSoundUrl);
}

export function playVoiceUndeafenedSound(): void {
  const now = Date.now();
  if (now - lastUndeafenAt < MIN_INTERVAL_MS) {
    return;
  }
  lastUndeafenAt = now;
  void playClip(undeafenSoundUrl);
}

export function isLocalUserDeafened(): boolean {
  const meId = useUserStore.getState().me?.id ?? null;
  if (meId == null) {
    return false;
  }
  const self = useVoiceStore.getState().participants.find((participant) => participant.user_id === meId);
  return self?.deafened === true;
}

/** Свой запуск трансляции. */
export function playStreamStartSound(): void {
  if (isLocalUserDeafened()) {
    return;
  }
  void playClip(streamStartSoundUrl);
}

/** Своё завершение трансляции. */
export function playStreamStopSound(): void {
  if (isLocalUserDeafened()) {
    return;
  }
  void playClip(streamEndSoundUrl);
}

/** Зритель подключился к трансляции (свой вход или чужой). */
export function playStreamJoinedSound(): void {
  if (isLocalUserDeafened()) {
    return;
  }
  void playClip(streamJoinSoundUrl);
}

/** Зритель вышел из трансляции (свой выход или чужой). */
export function playStreamLeftSound(): void {
  if (isLocalUserDeafened()) {
    return;
  }
  void playClip(streamLeaveSoundUrl);
}

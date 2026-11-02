import { useSyncExternalStore } from "react";

const MUTED_KEY = "hooba.chatNotify.muted.v1";
const SOUNDS_KEY = "hooba.chatNotify.sounds.v1";
const EMPTY: readonly number[] = [];

const listeners = new Set<() => void>();
let mutedIds: readonly number[] = readMuted();
let soundsEnabled = readSoundsEnabled();

function readMuted(): readonly number[] {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    if (!raw) {
      return EMPTY;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return EMPTY;
    }
    const ids = parsed.filter((id): id is number => Number.isInteger(id) && id > 0);
    return ids.length === 0 ? EMPTY : ids;
  } catch {
    return EMPTY;
  }
}

function readSoundsEnabled(): boolean {
  try {
    return localStorage.getItem(SOUNDS_KEY) !== "0";
  } catch {
    return true;
  }
}

function publish(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function isChannelNotificationMuted(channelId: number): boolean {
  return mutedIds.includes(channelId);
}

export function setChannelNotificationMuted(channelId: number, muted: boolean): void {
  const next = new Set(mutedIds);
  if (muted) {
    next.add(channelId);
  } else {
    next.delete(channelId);
  }
  const ids = [...next].sort((a, b) => a - b);
  const same = ids.length === mutedIds.length && ids.every((id, index) => id === mutedIds[index]);
  if (same) {
    return;
  }
  mutedIds = ids.length === 0 ? EMPTY : ids;
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify(mutedIds));
  } catch {
    /* private mode / quota */
  }
  publish();
}

export function chatNotificationSoundsEnabled(): boolean {
  return soundsEnabled;
}

export function setChatNotificationSoundsEnabled(enabled: boolean): void {
  if (soundsEnabled === enabled) {
    return;
  }
  soundsEnabled = enabled;
  try {
    localStorage.setItem(SOUNDS_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMutedChannelIds(): readonly number[] {
  return useSyncExternalStore(subscribe, () => mutedIds, () => EMPTY);
}

export function useChatNotificationSoundsEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => soundsEnabled, () => true);
}

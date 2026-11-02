import type { AvatarLook } from '@/shared/ui/avatar';
import { useSyncExternalStore } from 'react';

export type VoiceOverlayParticipant = {
  userId: number;
  username: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  /** Абсолютный URL головы персонажа и спека фона из каталога; null — буквенный. */
  avatar: AvatarLook | null;
};

export type VoiceOverlaySnapshot = {
  channelName: string;
  participants: VoiceOverlayParticipant[];
};

const STORAGE_KEY = 'hooba.voiceOverlay.v1';
const listeners = new Set<() => void>();

export function loadVoiceOverlayEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

const ONLY_IN_GAME_KEY = 'hooba.voiceOverlayOnlyInGame.v1';

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Только при запущенной игре; без включённого оверлея всегда false. */
export function loadVoiceOverlayOnlyInGame(): boolean {
  if (!loadVoiceOverlayEnabled()) {
    return false;
  }
  try {
    return localStorage.getItem(ONLY_IN_GAME_KEY) === '1';
  } catch {
    return false;
  }
}

export function setVoiceOverlayOnlyInGame(value: boolean): void {
  try {
    localStorage.setItem(ONLY_IN_GAME_KEY, value ? '1' : '0');
  } catch {
    /* private mode / quota */
  }
  notify();
}

export function setVoiceOverlayEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    if (!enabled) {
      localStorage.setItem(ONLY_IN_GAME_KEY, '0');
    }
  } catch {
    /* private mode / quota */
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoiceOverlayEnabled(): boolean {
  return useSyncExternalStore(subscribe, loadVoiceOverlayEnabled, () => true);
}

export function useVoiceOverlayOnlyInGame(): boolean {
  return useSyncExternalStore(subscribe, loadVoiceOverlayOnlyInGame, () => false);
}

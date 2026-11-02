import { useSyncExternalStore } from "react";

const MESSAGES_KEY = "hooba.toasts.messages.v1";
const GAMES_KEY = "hooba.toasts.games.v1";

const listeners = new Set<() => void>();
let messagesEnabled = readFlag(MESSAGES_KEY);
let gamesEnabled = readFlag(GAMES_KEY);

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}

function writeFlag(key: string, enabled: boolean): void {
  try {
    localStorage.setItem(key, enabled ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
  for (const listener of listeners) {
    listener();
  }
}

export function messageToastsEnabled(): boolean {
  return messagesEnabled;
}

export function setMessageToastsEnabled(enabled: boolean): void {
  if (messagesEnabled === enabled) {
    return;
  }
  messagesEnabled = enabled;
  writeFlag(MESSAGES_KEY, enabled);
}

export function gameToastsEnabled(): boolean {
  return gamesEnabled;
}

export function setGameToastsEnabled(enabled: boolean): void {
  if (gamesEnabled === enabled) {
    return;
  }
  gamesEnabled = enabled;
  writeFlag(GAMES_KEY, enabled);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMessageToastsEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => messagesEnabled, () => true);
}

export function useGameToastsEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => gamesEnabled, () => true);
}

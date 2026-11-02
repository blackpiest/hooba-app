import { useSyncExternalStore } from "react";

const STORAGE_KEY = "hooba.gameActivity.v1";

const listeners = new Set<() => void>();
let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function publish(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function gameActivityEnabled(): boolean {
  return enabled;
}

export function setGameActivityEnabled(next: boolean): void {
  if (enabled === next) {
    return;
  }
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGameActivityEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => enabled, () => true);
}

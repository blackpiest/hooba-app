import { useSyncExternalStore } from "react";

const EMPTY: readonly number[] = [];

const unread = new Set<number>();
const listeners = new Set<() => void>();
let snapshot: readonly number[] = EMPTY;

function publish(): void {
  snapshot = unread.size === 0 ? EMPTY : [...unread].sort((a, b) => a - b);
  for (const listener of listeners) {
    listener();
  }
}

export function markChannelUnread(channelId: number): void {
  if (unread.has(channelId)) {
    return;
  }
  unread.add(channelId);
  publish();
}

export function clearChannelUnread(channelId: number): void {
  if (!unread.delete(channelId)) {
    return;
  }
  publish();
}

export function getUnreadChannelIds(): readonly number[] {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUnreadChannelIds(): readonly number[] {
  return useSyncExternalStore(subscribe, getUnreadChannelIds, () => EMPTY);
}

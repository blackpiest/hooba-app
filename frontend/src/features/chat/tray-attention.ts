import { useSyncExternalStore } from "react";

let desktopWindowHidden = false;
const listeners = new Set<() => void>();

export function isDesktopWindowHidden(): boolean {
  return desktopWindowHidden;
}

export function setDesktopWindowHidden(hidden: boolean): void {
  if (desktopWindowHidden === hidden) {
    return;
  }
  desktopWindowHidden = hidden;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Пользователь смотрит на окно: оно не скрыто, вкладка видима и в фокусе. */
export function appIsOnScreen(): boolean {
  if (desktopWindowHidden) {
    return false;
  }
  return document.visibilityState === "visible" && document.hasFocus();
}

export function useDesktopWindowHidden(): boolean {
  return useSyncExternalStore(subscribe, isDesktopWindowHidden, () => false);
}

let publishedTrayAttention: boolean | null = null;

/** Красная точка на иконке трея. На вебе вызова нет. Повтор того же значения (каждый focus/blur) IPC не шлёт. */
export function publishTrayAttention(attention: boolean): void {
  if (publishedTrayAttention === attention) {
    return;
  }
  publishedTrayAttention = attention;
  window.hoobaDesktop?.setTrayAttention?.(attention);
}

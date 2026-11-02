import {
  getPttBinding,
  isPushToTalkActive,
  type PttCaptureEvent,
  type PttHookResult,
} from '../../shared/lib/voice-activation-prefs';

export type { PttCaptureEvent, PttHookResult };

let held = false;
const heldListeners = new Set<() => void>();

let hookError: string | null = null;
const errorListeners = new Set<() => void>();

const captureListeners = new Set<(event: PttCaptureEvent) => void>();

function setHeld(next: boolean): void {
  if (next === held) {
    return;
  }
  held = next;
  for (const listener of heldListeners) {
    listener();
  }
}

function setHookError(next: string | null): void {
  if (next === hookError) {
    return;
  }
  hookError = next;
  for (const listener of errorListeners) {
    listener();
  }
}

export function isPttHeld(): boolean {
  return held;
}

export function subscribePttHeld(listener: () => void): () => void {
  heldListeners.add(listener);
  return () => {
    heldListeners.delete(listener);
  };
}

export function getPttHookError(): string | null {
  return hookError;
}

export function subscribePttHookError(listener: () => void): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

export function subscribePttCapture(listener: (event: PttCaptureEvent) => void): () => void {
  captureListeners.add(listener);
  return () => {
    captureListeners.delete(listener);
  };
}

function noteHookResult(result: PttHookResult | null): void {
  setHookError(result && !result.ok ? result.reason : null);
}

/** Сообщить главному процессу, какую клавишу слушать. `null` — хук не нужен. */
export async function syncDesktopPushToTalk(): Promise<void> {
  const api = window.hoobaDesktop?.setPushToTalkBinding;
  if (!api) {
    return;
  }
  const binding = isPushToTalkActive() ? getPttBinding() : null;
  noteHookResult(await api(binding));
}

export async function beginPttCapture(): Promise<void> {
  const api = window.hoobaDesktop?.startPushToTalkCapture;
  if (!api) {
    return;
  }
  noteHookResult(await api());
}

export async function cancelPttCapture(): Promise<void> {
  await window.hoobaDesktop?.cancelPushToTalkCapture?.();
}

let installed = false;

/** Один раз на приложение: зажатие клавиши и результат назначения. */
export function installPttBridge(): void {
  if (installed) {
    return;
  }
  const api = window.hoobaDesktop;
  if (!api?.onPushToTalkHeld) {
    return;
  }
  installed = true;
  api.onPushToTalkHeld((next) => {
    setHeld(next === true);
  });
  api.onPushToTalkCapture?.((event) => {
    for (const listener of captureListeners) {
      listener(event);
    }
  });
}

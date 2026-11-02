import { isDesktopApp } from './server-target';

const STORAGE_KEY = 'hooba_voice_activation';

/** vad — речь определяет модель, ptt — микрофон открыт только пока зажата клавиша. */
export type VoiceActivationMode = 'vad' | 'ptt';

/** Код — keycode клавиши или номер кнопки мыши uiohook. В браузере режим рации не включается. */
export type PttKeyBinding = {
  kind: 'key' | 'mouse';
  code: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  label: string;
};

export type PttHookResult = { ok: true } | { ok: false; reason: string };

export type PttCaptureEvent =
  | { type: 'bind'; binding: PttKeyBinding }
  | { type: 'clear' }
  | { type: 'cancel' };

type ActivationState = {
  mode: VoiceActivationMode;
  binding: PttKeyBinding | null;
};

const listeners = new Set<() => void>();

function flag(value: unknown): boolean {
  return value === true;
}

function bindingFrom(value: unknown): PttKeyBinding | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec.code !== 'number' || !Number.isInteger(rec.code) || rec.code <= 0) {
    return null;
  }
  const label = typeof rec.label === 'string' ? rec.label.trim() : '';
  if (!label) {
    return null;
  }
  return {
    kind: rec.kind === 'mouse' ? 'mouse' : 'key',
    code: rec.code,
    ctrl: flag(rec.ctrl),
    alt: flag(rec.alt),
    shift: flag(rec.shift),
    meta: flag(rec.meta),
    label,
  };
}

function readState(): ActivationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { mode: 'vad', binding: null };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { mode: 'vad', binding: null };
    }
    const rec = parsed as Record<string, unknown>;
    return {
      mode: rec.mode === 'ptt' ? 'ptt' : 'vad',
      binding: bindingFrom(rec.binding),
    };
  } catch {
    return { mode: 'vad', binding: null };
  }
}

let state = readState();

function persist(): void {
  try {
    if (state.mode === 'vad' && state.binding == null) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota */
  }
}

function commit(next: ActivationState): void {
  state = next;
  persist();
  for (const listener of listeners) {
    listener();
  }
}

export function getVoiceActivationMode(): VoiceActivationMode {
  return state.mode;
}

/** Рация только в десктопе. В браузере сохранённый режим не открывает гейт по клавише. */
export function isPushToTalkActive(): boolean {
  return isDesktopApp() && state.mode === 'ptt';
}

export function getPttBinding(): PttKeyBinding | null {
  return state.binding;
}

export function setVoiceActivationMode(next: VoiceActivationMode): void {
  if (next === state.mode) {
    return;
  }
  commit({ ...state, mode: next });
}

export function setPttBinding(next: PttKeyBinding | null): void {
  const current = state.binding;
  if (
    current?.kind === next?.kind &&
    current?.code === next?.code &&
    current?.ctrl === next?.ctrl &&
    current?.alt === next?.alt &&
    current?.shift === next?.shift &&
    current?.meta === next?.meta &&
    current?.label === next?.label
  ) {
    return;
  }
  commit({ ...state, binding: next });
}

export function subscribeVoiceActivation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

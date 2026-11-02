const STORAGE_KEY = 'hooba_voice_sensitivity';

export const MANUAL_DEFAULT = 28;

type SensitivityState = {
  auto: boolean;
  manual: number;
};

const listeners = new Set<() => void>();

function clampManual(value: number): number {
  if (!Number.isFinite(value)) {
    return MANUAL_DEFAULT;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function readState(): SensitivityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { auto: true, manual: MANUAL_DEFAULT };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { auto: true, manual: MANUAL_DEFAULT };
    }
    const rec = parsed as Record<string, unknown>;
    return {
      auto: rec.auto !== false,
      manual: typeof rec.manual === 'number' ? clampManual(rec.manual) : MANUAL_DEFAULT,
    };
  } catch {
    return { auto: true, manual: MANUAL_DEFAULT };
  }
}

let state = readState();

function persist(): void {
  try {
    if (state.auto && state.manual === MANUAL_DEFAULT) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota */
  }
}

function commit(next: SensitivityState): void {
  state = next;
  persist();
  for (const listener of listeners) {
    listener();
  }
}

/** По умолчанию порог подстраивается сам, как в голосовом чате. */
export function isAutoSensitivityEnabled(): boolean {
  return state.auto;
}

/** 0 — открывать на любой похожести на речь, 100 — только когда модель почти уверена. */
export function getManualSensitivity(): number {
  return state.manual;
}

export function setAutoSensitivityEnabled(next: boolean): void {
  if (next === state.auto) {
    return;
  }
  commit({ ...state, auto: next });
}

export function setManualSensitivity(percent: number): void {
  const manual = clampManual(percent);
  if (manual === state.manual) {
    return;
  }
  commit({ ...state, manual });
}

export function subscribeVoiceSensitivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

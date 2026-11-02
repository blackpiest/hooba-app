const STORAGE_KEY = 'hooba_voice_processing';

/** suppress — шумоподавление браузера, off — микрофон как есть. */
export type VoiceCaptureMode = 'off' | 'suppress';

type VoiceProcessingState = {
  mode: VoiceCaptureMode;
};

function modeFromRecord(rec: Record<string, unknown>): VoiceCaptureMode {
  if (rec.mode === 'off' || rec.noise === false) {
    return 'off';
  }
  return 'suppress';
}

function loadState(): { state: VoiceProcessingState; rewrite: boolean } {
  const defaults: VoiceProcessingState = { mode: 'suppress' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === '1') {
      return { state: defaults, rewrite: false };
    }
    if (raw === '0') {
      return { state: { mode: 'off' }, rewrite: false };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { state: defaults, rewrite: false };
    }
    const rec = parsed as Record<string, unknown>;
    return {
      state: { mode: modeFromRecord(rec) },
      rewrite: rec.mode === 'isolate' || rec.isolate === true || rec.autoGain === true,
    };
  } catch {
    return { state: defaults, rewrite: false };
  }
}

const loaded = loadState();
let state = loaded.state;

function persist(): void {
  try {
    if (state.mode === 'suppress') {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota */
  }
}

if (loaded.rewrite) {
  persist();
}

export function getVoiceCaptureMode(): VoiceCaptureMode {
  return state.mode;
}

export function setVoiceCaptureMode(next: VoiceCaptureMode): void {
  if (next === state.mode) {
    return;
  }
  state = { ...state, mode: next };
  persist();
}

/** Эхоподавление браузера. Вместе с шумоподавлением оно и работает. */
export function isEchoCancellationEnabled(): boolean {
  return state.mode !== 'off';
}

/** Штатное шумоподавление браузера. */
export function isBrowserNoiseSuppressionEnabled(): boolean {
  return state.mode === 'suppress';
}

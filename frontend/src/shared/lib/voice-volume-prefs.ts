const STORAGE_KEY = 'hooba_voice_volume';

export const VOICE_VOLUME_MIN = 0;
export const VOICE_VOLUME_MAX = 200;
export const VOICE_VOLUME_DEFAULT = 100;

type VolumeState = {
  input: number;
  output: number;
  users: Record<string, number>;
};

const listeners = new Set<() => void>();

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return VOICE_VOLUME_DEFAULT;
  }
  return Math.min(VOICE_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, Math.round(value)));
}

function readState(): VolumeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { input: VOICE_VOLUME_DEFAULT, output: VOICE_VOLUME_DEFAULT, users: {} };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { input: VOICE_VOLUME_DEFAULT, output: VOICE_VOLUME_DEFAULT, users: {} };
    }
    const rec = parsed as Record<string, unknown>;
    const users: Record<string, number> = {};
    if (rec.users && typeof rec.users === 'object') {
      for (const [key, value] of Object.entries(rec.users as Record<string, unknown>)) {
        if (typeof value === 'number') {
          users[key] = clampVolume(value);
        }
      }
    }
    return {
      input: typeof rec.input === 'number' ? clampVolume(rec.input) : VOICE_VOLUME_DEFAULT,
      output: typeof rec.output === 'number' ? clampVolume(rec.output) : VOICE_VOLUME_DEFAULT,
      users,
    };
  } catch {
    return { input: VOICE_VOLUME_DEFAULT, output: VOICE_VOLUME_DEFAULT, users: {} };
  }
}

let state = readState();

function persist(): void {
  try {
    const users: Record<string, number> = {};
    for (const [key, value] of Object.entries(state.users)) {
      if (value !== VOICE_VOLUME_DEFAULT) {
        users[key] = value;
      }
    }
    const isDefault =
      state.input === VOICE_VOLUME_DEFAULT &&
      state.output === VOICE_VOLUME_DEFAULT &&
      Object.keys(users).length === 0;
    if (isDefault) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ input: state.input, output: state.output, users }),
    );
  } catch {
    /* private mode / quota */
  }
}

function commit(next: VolumeState): void {
  state = next;
  persist();
  for (const listener of listeners) {
    listener();
  }
}

/** 1 = 100%. */
export function volumeToGain(percent: number): number {
  return clampVolume(percent) / 100;
}

export function getInputVolume(): number {
  return state.input;
}

export function getOutputVolume(): number {
  return state.output;
}

export function getUserVolume(userId: number): number {
  return state.users[String(userId)] ?? VOICE_VOLUME_DEFAULT;
}

export function setInputVolume(percent: number): void {
  const input = clampVolume(percent);
  if (input === state.input) {
    return;
  }
  commit({ ...state, input });
}

export function setOutputVolume(percent: number): void {
  const output = clampVolume(percent);
  if (output === state.output) {
    return;
  }
  commit({ ...state, output });
}

export function setUserVolume(userId: number, percent: number): void {
  const key = String(userId);
  const nextValue = clampVolume(percent);
  const current = state.users[key] ?? VOICE_VOLUME_DEFAULT;
  if (nextValue === current) {
    return;
  }
  const users = { ...state.users };
  if (nextValue === VOICE_VOLUME_DEFAULT) {
    delete users[key];
  } else {
    users[key] = nextValue;
  }
  commit({ ...state, users });
}

export function subscribeVoiceVolume(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const STORAGE_KEY = 'hooba_voice_volume';

export const VOICE_VOLUME_MIN = 0;
export const VOICE_VOLUME_MAX = 200;
export const VOICE_VOLUME_DEFAULT = 100;

type VolumeState = {
  input: number;
  output: number;
  users: Record<string, number>;
  /** Звук демонстрации экрана по id ведущего — только у этого зрителя. */
  streams: Record<string, number>;
};

const listeners = new Set<() => void>();

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return VOICE_VOLUME_DEFAULT;
  }
  return Math.min(VOICE_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, Math.round(value)));
}

function emptyState(): VolumeState {
  return { input: VOICE_VOLUME_DEFAULT, output: VOICE_VOLUME_DEFAULT, users: {}, streams: {} };
}

function readVolumeMap(raw: unknown): Record<string, number> {
  const map: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number') {
        map[key] = clampVolume(value);
      }
    }
  }
  return map;
}

/** Без значений по умолчанию: в localStorage храним только отличия. */
function compactVolumeMap(map: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    if (value !== VOICE_VOLUME_DEFAULT) {
      result[key] = value;
    }
  }
  return result;
}

function readState(): VolumeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return emptyState();
    }
    const rec = parsed as Record<string, unknown>;
    return {
      input: typeof rec.input === 'number' ? clampVolume(rec.input) : VOICE_VOLUME_DEFAULT,
      output: typeof rec.output === 'number' ? clampVolume(rec.output) : VOICE_VOLUME_DEFAULT,
      users: readVolumeMap(rec.users),
      streams: readVolumeMap(rec.streams),
    };
  } catch {
    return emptyState();
  }
}

let state = readState();

function persist(): void {
  try {
    const users = compactVolumeMap(state.users);
    const streams = compactVolumeMap(state.streams);
    const isDefault =
      state.input === VOICE_VOLUME_DEFAULT &&
      state.output === VOICE_VOLUME_DEFAULT &&
      Object.keys(users).length === 0 &&
      Object.keys(streams).length === 0;
    if (isDefault) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ input: state.input, output: state.output, users, streams }),
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

function withVolume(map: Record<string, number>, userId: number, percent: number): Record<string, number> | null {
  const key = String(userId);
  const nextValue = clampVolume(percent);
  if (nextValue === (map[key] ?? VOICE_VOLUME_DEFAULT)) {
    return null;
  }
  const next = { ...map };
  if (nextValue === VOICE_VOLUME_DEFAULT) {
    delete next[key];
  } else {
    next[key] = nextValue;
  }
  return next;
}

export function setUserVolume(userId: number, percent: number): void {
  const users = withVolume(state.users, userId, percent);
  if (users) {
    commit({ ...state, users });
  }
}

/** Громкость демонстрации экрана этого ведущего (0–200%), не зависит от громкости его голоса. */
export function getStreamVolume(userId: number): number {
  return state.streams[String(userId)] ?? VOICE_VOLUME_DEFAULT;
}

export function setStreamVolume(userId: number, percent: number): void {
  const streams = withVolume(state.streams, userId, percent);
  if (streams) {
    commit({ ...state, streams });
  }
}

export function subscribeVoiceVolume(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

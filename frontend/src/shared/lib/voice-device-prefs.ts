const STORAGE_KEY = 'hooba.voiceDevices.v1';

export type VoiceDevicePrefs = {
  inputDeviceId?: string;
  outputDeviceId?: string;
};

export function loadVoiceDevicePrefs(): VoiceDevicePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') {
      return {};
    }
    const rec = o as Record<string, unknown>;
    const inputDeviceId = typeof rec.inputDeviceId === 'string' ? rec.inputDeviceId : undefined;
    const outputDeviceId = typeof rec.outputDeviceId === 'string' ? rec.outputDeviceId : undefined;
    return { inputDeviceId, outputDeviceId };
  } catch {
    return {};
  }
}

export function saveVoiceDevicePrefs(prefs: VoiceDevicePrefs): void {
  try {
    const next: VoiceDevicePrefs = {};
    if (prefs.inputDeviceId) {
      next.inputDeviceId = prefs.inputDeviceId;
    }
    if (prefs.outputDeviceId) {
      next.outputDeviceId = prefs.outputDeviceId;
    }
    if (Object.keys(next).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* private mode / quota */
  }
}

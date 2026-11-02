import { createVad, type FluidVad } from '@fluidinference/fluidvad';
import wasmUrl from '@fluidinference/fluidvad/dist/fluidvad_bg.wasm?url';
import vadTapUrl from './vad-tap-processor.js?url&no-inline';
import { isPushToTalkActive } from '../../shared/lib/voice-activation-prefs';
import {
  getManualSensitivity,
  isAutoSensitivityEnabled,
} from '../../shared/lib/voice-sensitivity-prefs';
import { isPttHeld, subscribePttHeld } from './ptt-state';

/** Авторежим: вероятность, с которой кадр считается речью. */
export const AUTO_OPEN = 0.38;
/** Ниже этого речь в авторежиме уже кончилась. */
export const AUTO_CLOSE = 0.22;
/** Сколько тишины после фразы, прежде чем закрыть микрофон. */
export const HANG_MS = 320;
/** Кадр модели: 512 сэмплов при 16 кГц. */
export const SPEECH_FRAME_MS = 32;
/** Пять кадров (~160 мс): щелчок короче этого микрофон не открывает. */
export const CONFIRM_FRAMES = 5;
/** Звук ждёт решения модели, чтобы первое слово не пропало. */
const LOOKAHEAD_MS = 220;
/** Первые кадры модели и пустой компрессор не считаются речью. */
const MODEL_WARMUP_MS = 200;

export type SpeechGateState = {
  speaking: boolean;
  hotFrames: number;
  belowSince: number | null;
};

export function initialSpeechGateState(): SpeechGateState {
  return { speaking: false, hotFrames: 0, belowSince: null };
}

/** Один кадр вероятности. Щелчок не набирает пять кадров, фраза — набирает. */
export function stepSpeechGate(
  state: SpeechGateState,
  probability: number,
  now: number,
  openAt: number,
  closeAt: number,
): SpeechGateState {
  let { speaking, hotFrames, belowSince } = state;
  if (probability >= openAt) {
    hotFrames += 1;
    belowSince = null;
  } else if (probability < closeAt) {
    hotFrames = 0;
  }
  if (!speaking) {
    if (hotFrames >= CONFIRM_FRAMES) {
      speaking = true;
    }
  } else if (probability >= closeAt) {
    belowSince = null;
  } else if (belowSince === null) {
    belowSince = now;
  } else if (now - belowSince >= HANG_MS) {
    speaking = false;
    hotFrames = 0;
  }
  return { speaking, hotFrames, belowSince };
}

const workletsReady = new WeakSet<BaseAudioContext>();

/** Тот же origin, что и страница: в собранном десктопе blob режет script-src, а worklet-src Electron не читает. */
async function installVadTap(context: BaseAudioContext): Promise<void> {
  if (workletsReady.has(context)) {
    return;
  }
  try {
    await context.audioWorklet.addModule(vadTapUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('already registered')) {
      throw error;
    }
  }
  workletsReady.add(context);
}

let inputLevel = 0;
const levelListeners = new Set<() => void>();
let activeMeters = 0;

export function subscribeInputLevel(listener: () => void): () => void {
  levelListeners.add(listener);
  return () => {
    levelListeners.delete(listener);
  };
}

export function getInputLevel(): number {
  return inputLevel;
}

function setInputLevel(next: number): void {
  if (next === inputLevel) {
    return;
  }
  inputLevel = next;
  for (const listener of levelListeners) {
    listener();
  }
}

function openMeterSlot(): { publish: (level: number) => void; close: () => void } {
  activeMeters += 1;
  let closed = false;
  return {
    publish(level: number) {
      if (!closed) {
        setInputLevel(level);
      }
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      activeMeters -= 1;
      if (activeMeters <= 0) {
        activeMeters = 0;
        setInputLevel(0);
      }
    },
  };
}

function holdGain(param: AudioParam, now: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now);
    return;
  }
  param.cancelScheduledValues(now);
}

function setGateOpen(gate: GainNode, open: boolean): void {
  const param = gate.gain;
  const now = gate.context.currentTime;
  holdGain(param, now);
  if (open) {
    param.setValueAtTime(1, now);
    return;
  }
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(0, now + 0.05);
}

function thresholds(): { openAt: number; closeAt: number } {
  if (isAutoSensitivityEnabled()) {
    return { openAt: AUTO_OPEN, closeAt: AUTO_CLOSE };
  }
  const openAt = Math.min(1, Math.max(0, getManualSensitivity() / 100));
  return { openAt, closeAt: Math.max(0.05, openAt - 0.15) };
}

/**
 * Речь отделяет модель, а не громкость. Ниже порога в канал уходит тишина.
 * Белая черта на ручке — вероятность речи, 0–100.
 */
export function attachSensitivityGate(
  context: AudioContext,
  input: AudioNode,
  onModel?: (status: 'live' | 'missing') => void,
): { output: GainNode; stop: () => void } {
  const delay = context.createDelay(0.5);
  delay.delayTime.value = LOOKAHEAD_MS / 1000;
  const gate = context.createGain();
  gate.gain.value = 0;
  input.connect(delay);
  delay.connect(gate);

  const meter = openMeterSlot();
  let stopped = false;
  let vad: FluidVad | null = null;
  let tap: AudioWorkletNode | null = null;
  let pull: GainNode | null = null;
  let applied = false;
  let gateState = initialSpeechGateState();
  let sawProbability = false;
  let reportedLive = false;
  let warmed = false;
  let watchdog = 0;
  const modelReadyAt = Date.now() + MODEL_WARMUP_MS;

  const applyKey = (open: boolean) => {
    gateState = { speaking: open, hotFrames: 0, belowSince: null };
    if (open !== applied || (open && gate.gain.value < 0.99)) {
      applied = open;
      setGateOpen(gate, open);
    }
  };

  const applyProbability = (probability: number) => {
    if (!reportedLive) {
      reportedLive = true;
      onModel?.('live');
    }
    sawProbability = true;
    window.clearTimeout(watchdog);
    if (isPushToTalkActive()) {
      applyKey(isPttHeld());
      return;
    }
    const now = Date.now();
    if (now < modelReadyAt) {
      gateState = initialSpeechGateState();
      if (applied) {
        applied = false;
        setGateOpen(gate, false);
      }
      meter.publish(Math.round(Math.min(1, Math.max(0, probability)) * 100));
      return;
    }
    if (!warmed) {
      warmed = true;
      gateState = initialSpeechGateState();
    }
    const { openAt, closeAt } = thresholds();
    gateState = stepSpeechGate(gateState, probability, now, openAt, closeAt);
    if (gateState.speaking !== applied) {
      applied = gateState.speaking;
      setGateOpen(gate, gateState.speaking);
    } else if (gateState.speaking && gate.gain.value < 0.99) {
      setGateOpen(gate, true);
    }
    meter.publish(Math.round(Math.min(1, Math.max(0, probability)) * 100));
  };

  const noteModelMissing = () => {
    if (stopped || sawProbability) {
      return;
    }
    sawProbability = true;
    window.clearTimeout(watchdog);
    onModel?.('missing');
    console.warn('[voice] speech model did not start; microphone stays closed');
  };

  watchdog = window.setTimeout(() => {
    if (!stopped && !sawProbability && !isPushToTalkActive()) {
      noteModelMissing();
    }
  }, 2000);

  const unsubKey = subscribePttHeld(() => {
    if (stopped || !isPushToTalkActive()) {
      return;
    }
    sawProbability = true;
    window.clearTimeout(watchdog);
    applyKey(isPttHeld());
  });
  if (isPushToTalkActive()) {
    applyKey(isPttHeld());
  }

  void (async () => {
    try {
      if (typeof AudioWorkletNode === 'undefined') {
        noteModelMissing();
        return;
      }
      vad = await createVad(undefined, { wasm: fetch(wasmUrl) });
      if (stopped) {
        vad.free();
        vad = null;
        return;
      }
      await installVadTap(context);
      if (stopped) {
        vad.free();
        vad = null;
        return;
      }
      tap = new AudioWorkletNode(context, 'hooba-vad-tap', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (stopped || !vad) {
          return;
        }
        const events = vad.push(event.data);
        for (const item of events) {
          item.free();
        }
        applyProbability(vad.lastProbability);
      };
      input.connect(tap);
      // Ноль на GainNode Chrome выбрасывает из графа: process() не зовут,
      // кадры не приходят, и гейт так и остаётся закрытым. Тихий ненулевой
      // выход в динамики ворклет тянет, а в колонки молчит: процессор пишет нули.
      pull = context.createGain();
      pull.gain.value = 1e-5;
      tap.connect(pull);
      pull.connect(context.destination);
    } catch (error) {
      console.warn('[voice] speech model failed to start', error);
      noteModelMissing();
    }
  })();

  return {
    output: gate,
    stop() {
      stopped = true;
      unsubKey();
      window.clearTimeout(watchdog);
      meter.close();
      try {
        tap?.disconnect();
      } catch {
        /* already disconnected */
      }
      tap = null;
      try {
        pull?.disconnect();
      } catch {
        /* already disconnected */
      }
      pull = null;
      try {
        vad?.free();
      } catch {
        /* already freed */
      }
      vad = null;
      try {
        delay.disconnect();
      } catch {
        /* already disconnected */
      }
      try {
        gate.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}

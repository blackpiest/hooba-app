import { isPttHeld, subscribePttHeld } from './ptt-state';

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

/**
 * Микрофон открыт только пока зажата клавиша рации.
 * Модель речи и задержка первого слова здесь не участвуют.
 */
export function attachPttGate(
  context: AudioContext,
  input: AudioNode,
): { output: GainNode; stop: () => void } {
  const gate = context.createGain();
  gate.gain.value = isPttHeld() ? 1 : 0;
  input.connect(gate);
  const unsubscribe = subscribePttHeld(() => {
    setGateOpen(gate, isPttHeld());
  });
  return {
    output: gate,
    stop() {
      unsubscribe();
      try {
        gate.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}

export type VoiceTransportDirection = 'send' | 'recv';

/** Сколько ждать соединения: браузер, не сумевший разобрать адрес сервера, может не перейти в `failed` никогда. */
export const VOICE_CONNECT_TIMEOUT_MS = 20_000;

/**
 * Следит, что транспорты голоса реально соединились. Сигналинг идёт по WS и при этом работает,
 * поэтому без такой проверки участник сидит в канале без звука и без единой ошибки.
 * `onChange(true)` — хотя бы один транспорт не соединился; `onChange(false)` — связь восстановилась.
 */
export function createVoiceConnectionWatch(
  onChange: (failed: boolean) => void,
  timeoutMs: number = VOICE_CONNECT_TIMEOUT_MS,
) {
  const failed = new Set<VoiceTransportDirection>();
  const timers = new Map<VoiceTransportDirection, ReturnType<typeof setTimeout>>();
  let reported = false;
  let disposed = false;

  const report = () => {
    const next = failed.size > 0;
    if (next !== reported) {
      reported = next;
      onChange(next);
    }
  };

  const clearTimer = (direction: VoiceTransportDirection) => {
    const timer = timers.get(direction);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(direction);
    }
  };

  const markFailed = (direction: VoiceTransportDirection) => {
    clearTimer(direction);
    failed.add(direction);
    report();
  };

  const markSettled = (direction: VoiceTransportDirection) => {
    clearTimer(direction);
    failed.delete(direction);
    report();
  };

  const connecting = (direction: VoiceTransportDirection) => {
    if (disposed || timers.has(direction) || failed.has(direction)) {
      return;
    }
    timers.set(
      direction,
      setTimeout(() => {
        timers.delete(direction);
        markFailed(direction);
      }, timeoutMs),
    );
  };

  return {
    /** Транспорт начал соединяться (событие `connect` mediasoup-client). */
    connecting,
    state(direction: VoiceTransportDirection, state: string) {
      if (disposed) {
        return;
      }
      if (state === 'connecting') {
        connecting(direction);
      } else if (state === 'connected' || state === 'closed') {
        markSettled(direction);
      } else if (state === 'failed') {
        markFailed(direction);
      }
    },
    dispose() {
      disposed = true;
      for (const direction of [...timers.keys()]) {
        clearTimer(direction);
      }
    },
  };
}

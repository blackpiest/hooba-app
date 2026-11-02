import { clearTokens } from './auth-storage';

type Listener = () => void;
const listeners: Listener[] = [];

let sessionEpoch = 0;

/** Меняется на каждый полный сброс сессии. Поздний ответ сравнивает эпоху со своей. */
export function getSessionEpoch(): number {
  return sessionEpoch;
}

/** Сброс кэша me и т.п. при полной очистке сессии (logout, битый refresh). */
export function registerSessionClear(fn: Listener): void {
  listeners.push(fn);
}

export function clearSessionClient(): void {
  sessionEpoch += 1;
  clearTokens();
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* noop */
    }
  }
}

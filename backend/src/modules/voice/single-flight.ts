const inflight = new Map<unknown, Promise<unknown>>();

/** Второй вызов с тем же ключом ждёт промис первого, пока тот не завершится. */
export function singleFlight<T>(key: unknown, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const pending = factory().finally(() => {
    if (inflight.get(key) === pending) {
      inflight.delete(key);
    }
  });
  inflight.set(key, pending);
  return pending;
}

export function forgetSingleFlight(key: unknown): void {
  inflight.delete(key);
}

export function resetSingleFlightForTests(): void {
  inflight.clear();
}

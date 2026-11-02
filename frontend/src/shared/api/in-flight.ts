const inFlight = new Map<string, Promise<unknown>>();

/**
 * Склеивает одновременные одинаковые чтения (повтор эффекта при StrictMode, два места на экране).
 * Кэша нет: ключ живёт, пока запрос в полёте, следующий вызов после ответа идёт в сеть заново.
 */
export function shareInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = run().finally(() => {
    if (inFlight.get(key) === promise) {
      inFlight.delete(key);
    }
  });
  inFlight.set(key, promise);
  return promise;
}

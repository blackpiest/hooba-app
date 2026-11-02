type Bucket = { stamps: number[]; windowMs: number };

const buckets = new Map<string, Bucket>();

function freshStamps(key: string, windowMs: number, now: number): number[] {
  return (buckets.get(key)?.stamps ?? []).filter((stamp) => now - stamp < windowMs);
}

function sweepExpired(now: number): void {
  if (buckets.size <= 2000) {
    return;
  }
  for (const [bucketKey, bucket] of buckets) {
    if (!bucket.stamps.some((stamp) => now - stamp < bucket.windowMs)) {
      buckets.delete(bucketKey);
    }
  }
}

/** Returns false when the key is already at the limit for this window. */
export function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const fresh = freshStamps(key, windowMs, now);
  if (fresh.length >= limit) {
    buckets.set(key, { stamps: fresh, windowMs });
    return false;
  }
  fresh.push(now);
  buckets.set(key, { stamps: fresh, windowMs });
  sweepExpired(now);
  return true;
}

/** Проверка без записи: true, если ключ уже упёрся в лимит. */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  return freshStamps(key, windowMs, Date.now()).length >= limit;
}

/** Записывает попадание без проверки лимита (для учёта только неудачных попыток). */
export function recordRateLimitHit(key: string, windowMs: number): void {
  const now = Date.now();
  const fresh = freshStamps(key, windowMs, now);
  fresh.push(now);
  buckets.set(key, { stamps: fresh, windowMs });
  sweepExpired(now);
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Сброс окон лимита между тестами одного процесса. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}

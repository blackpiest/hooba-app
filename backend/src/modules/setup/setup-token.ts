import { createHash, timingSafeEqual } from 'node:crypto';

/** Сравнение через SHA-256, чтобы разная длина секрета не бросала timingSafeEqual. */
export function setupTokensMatch(expected: string, provided: string): boolean {
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(provided).digest();
  return timingSafeEqual(a, b);
}

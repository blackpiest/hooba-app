import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import { shareInFlight } from './in-flight';

/** Синхронно с backend `word-filter.ts`. */
export const BANNED_WORDS_MAX = 500;
export const BANNED_WORD_MAX_LENGTH = 64;

const PATTERN = /^\*?[\p{L}\p{M}\p{N}]+\*?$/u;

/** Шаблон в хранимом виде или null: буквы/цифры, `*` только по краям. */
export function normalizeBannedPattern(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > BANNED_WORD_MAX_LENGTH) {
    return null;
  }
  return PATTERN.test(value) ? value : null;
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

export function fetchBannedWords(): Promise<string[]> {
  return shareInFlight('word-filter', async () => {
    const res = await authenticatedFetch(apiUrl('/api/v1/word-filter'));
    return (await parseEnvelope<{ words: string[] }>(res)).words;
  });
}

export async function saveBannedWords(words: string[]): Promise<string[]> {
  const res = await authenticatedFetch(apiUrl('/api/v1/word-filter'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words }),
  });
  return (await parseEnvelope<{ words: string[] }>(res)).words;
}

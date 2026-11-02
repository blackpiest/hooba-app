import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import { shareInFlight } from './in-flight';

/** Кастомный смайлик сообщества. `url` — относительный путь, неизменный (версия в `?v=`). */
export type CustomEmojiDto = { id: number; name: string; url: string; width: number; height: number };

/** Синхронно с backend `emojis.schemas.ts` и `image-pipeline.ts`. */
export const MAX_CUSTOM_EMOJIS = 32;
export const MAX_EMOJI_UPLOAD_BYTES = 256 * 1024;
export const EMOJI_MIN_SIDE = 16;
export const EMOJI_MAX_INPUT_SIDE = 1024;
export const EMOJI_ACCEPT = 'image/png,image/jpeg,image/webp';
const EMOJI_NAME = /^[a-z0-9_]{2,32}$/;

/** Имя в хранимом виде или null. */
export function normalizeEmojiName(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return EMOJI_NAME.test(value) ? value : null;
}

/** Подсказка имени из имени файла: `Party Parrot.png` → `party_parrot`. */
export function emojiNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : res.status === 413 ? 'FILE_TOO_LARGE' : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

export function fetchCustomEmojis(): Promise<CustomEmojiDto[]> {
  return shareInFlight('emojis', async () => {
    const res = await authenticatedFetch(apiUrl('/api/v1/emojis'));
    return (await parseEnvelope<{ emojis: CustomEmojiDto[] }>(res)).emojis;
  });
}

export async function uploadCustomEmoji(name: string, file: File): Promise<CustomEmojiDto> {
  const body = new FormData();
  body.append('file', file, file.name || 'emoji.png');
  const res = await authenticatedFetch(apiUrl(`/api/v1/emojis?name=${encodeURIComponent(name)}`), {
    method: 'POST',
    body,
  });
  return parseEnvelope<CustomEmojiDto>(res);
}

export async function renameCustomEmoji(id: number, name: string): Promise<CustomEmojiDto> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/emojis/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return parseEnvelope<CustomEmojiDto>(res);
}

export async function deleteCustomEmoji(id: number): Promise<void> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/emojis/${id}`), { method: 'DELETE' });
  await parseEnvelope<{ ok: boolean }>(res);
}

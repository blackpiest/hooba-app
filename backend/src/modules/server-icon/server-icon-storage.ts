import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storageConfig } from '../attachments/attachment-storage.js';

/**
 * Аватар сервера: <UPLOADS_DIR>/server/icon-<key>.webp, key — случайный (новый на каждую загрузку).
 * На диске остаётся только текущий файл. Без входа аватар недоступен: ссылку с подписью и сроком
 * выдают только `auth/me`, `auth:success`, `server:settings` и owner-роуты (как у картинок чата).
 */
const KEY_RE = /^[0-9a-f]{16}$/;
const ICON_FILE_RE = /^icon-([0-9a-f]{16})\.webp$/;
const ICON_ANY_RE = /^icon-.+\.webp(\.tmp)?$/;

function iconDir(): string {
  return path.join(storageConfig().dir, 'server');
}

function iconPath(key: string): string {
  if (!KEY_RE.test(key)) {
    throw new Error('Invalid server icon key');
  }
  return path.join(iconDir(), `icon-${key}.webp`);
}

export function newServerIconKey(): string {
  return randomBytes(8).toString('hex');
}

/** Ссылка живёт сутки; конец срока округлён до часа, чтобы URL был стабилен и кэшировался браузером. */
const URL_TTL_MS = 24 * 60 * 60 * 1000;
const URL_ROUND_MS = 60 * 60 * 1000;

/** Свой ключ, производный от ключа вложений: подпись аватара нельзя выдать за подпись картинки чата. */
function signature(key: string, expSec: number): string {
  const iconKey = createHmac('sha256', storageConfig().signingKey).update('hooba:server-icon:v1').digest();
  return createHmac('sha256', iconKey).update(`${key}:${expSec}`).digest('base64url');
}

export function serverIconUrl(key: string | null, now = Date.now()): string | null {
  if (!key) {
    return null;
  }
  const expSec = Math.floor(Math.ceil((now + URL_TTL_MS) / URL_ROUND_MS) * URL_ROUND_MS / 1000);
  return `/api/v1/server/icon/icon-${key}.webp?exp=${expSec}&sig=${signature(key, expSec)}`;
}

/**
 * Ключ из имени файла, если подпись и срок верны; иначе null.
 * `left` — секунды до истечения (для Cache-Control).
 */
export function verifyServerIconLink(
  file: string,
  expSec: number,
  sig: string,
  now = Date.now(),
): { key: string; left: number } | null {
  const match = ICON_FILE_RE.exec(file);
  const left = expSec - Math.floor(now / 1000);
  if (!match || !Number.isFinite(expSec) || left <= 0 || left > (URL_TTL_MS + URL_ROUND_MS) / 1000) {
    return null;
  }
  const expected = Buffer.from(signature(match[1], expSec));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return { key: match[1], left };
}

export async function writeServerIconFile(key: string, data: Buffer): Promise<void> {
  const target = iconPath(key);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, data, { mode: 0o644 });
  await rename(tmp, target);
}

/** Файл по ключу; null — файла нет (аватар сменили или убрали). */
export async function readServerIconFile(key: string): Promise<Buffer | null> {
  try {
    return await readFile(iconPath(key));
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** Удалить все файлы аватара, кроме `keep` (прежний и сироты после сбоев). */
export async function removeServerIconFilesExcept(keep: string | null): Promise<void> {
  let names: string[];
  try {
    names = await readdir(iconDir());
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return;
    }
    throw error;
  }
  const keepName = keep ? `icon-${keep}.webp` : null;
  await Promise.all(
    names
      .filter((name) => ICON_ANY_RE.test(name) && name !== keepName)
      .map((name) => rm(path.join(iconDir(), name), { force: true })),
  );
}

export async function removeServerIconFile(key: string): Promise<void> {
  await rm(iconPath(key), { force: true });
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, rename, rm, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../../config/env.js';

export type AttachmentVariant = 'full' | 'thumb';
export const ATTACHMENT_VARIANTS: readonly AttachmentVariant[] = ['full', 'thumb'];

/** Подписанная ссылка живёт сутки; конец срока округлён до часа, чтобы URL был стабилен и кэшировался браузером. */
const URL_TTL_MS = 24 * 60 * 60 * 1000;
const URL_ROUND_MS = 60 * 60 * 1000;

type StorageConfig = {
  dir: string;
  maxBytes: number;
  minFreeBytes: number;
  serveMode: Env['UPLOADS_SERVE_MODE'];
  signingKey: Buffer;
};

let config: StorageConfig | null = null;

export function configureAttachmentStorage(env: Env): void {
  config = {
    dir: path.resolve(env.UPLOADS_DIR),
    maxBytes: env.UPLOADS_MAX_BYTES,
    minFreeBytes: env.UPLOADS_MIN_FREE_BYTES,
    serveMode: env.UPLOADS_SERVE_MODE,
    // Отдельный ключ, производный от JWT_SECRET: подпись картинки нельзя выдать за токен и наоборот.
    signingKey: createHmac('sha256', env.JWT_SECRET).update('hooba:attachments:v1').digest(),
  };
}

export function storageConfig(): StorageConfig {
  if (!config) {
    throw new Error('Attachment storage is not configured');
  }
  return config;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isAttachmentId(value: string): boolean {
  return UUID_RE.test(value);
}

/** Имя на диске — только серверный UUID, пользовательское имя файла сюда не попадает. */
export function variantPath(id: string, variant: AttachmentVariant): string {
  if (!isAttachmentId(id)) {
    throw new Error('Invalid attachment id');
  }
  return path.join(storageConfig().dir, id, `${variant}.webp`);
}

export async function writeAttachmentFiles(id: string, files: Record<AttachmentVariant, Buffer>): Promise<void> {
  const dir = path.dirname(variantPath(id, 'full'));
  // 0755/0644: nginx в контейнере web читает файлы от своего пользователя (том смонтирован :ro).
  await mkdir(dir, { recursive: true, mode: 0o755 });
  try {
    for (const variant of ATTACHMENT_VARIANTS) {
      const target = variantPath(id, variant);
      const tmp = `${target}.tmp`;
      await writeFile(tmp, files[variant], { mode: 0o644 });
      await rename(tmp, target);
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function removeAttachmentFiles(id: string): Promise<void> {
  await rm(path.dirname(variantPath(id, 'full')), { recursive: true, force: true });
}

/** Свободное место на томе с картинками; null — платформа не умеет statfs. */
export async function freeDiskBytes(): Promise<number | null> {
  const dir = storageConfig().dir;
  try {
    await mkdir(dir, { recursive: true, mode: 0o755 });
    const st = await statfs(dir);
    return st.bavail * st.bsize;
  } catch {
    return null;
  }
}

function signature(id: string, variant: AttachmentVariant, exp: number): string {
  return createHmac('sha256', storageConfig().signingKey)
    .update(`${id}:${variant}:${exp}`)
    .digest('base64url');
}

export function signedAttachmentUrl(id: string, variant: AttachmentVariant, now = Date.now()): string {
  const exp = Math.ceil((now + URL_TTL_MS) / URL_ROUND_MS) * URL_ROUND_MS;
  const expSec = Math.floor(exp / 1000);
  return `/api/v1/attachments/${id}/${variant}?exp=${expSec}&sig=${signature(id, variant, expSec)}`;
}

/** Проверка подписи и срока. Секунды до истечения — для Cache-Control; null — ссылка недействительна. */
export function verifyAttachmentSignature(
  id: string,
  variant: AttachmentVariant,
  expSec: number,
  sig: string,
  now = Date.now(),
): number | null {
  const left = expSec - Math.floor(now / 1000);
  if (!Number.isFinite(expSec) || left <= 0 || left > (URL_TTL_MS + URL_ROUND_MS) / 1000) {
    return null;
  }
  const expected = Buffer.from(signature(id, variant, expSec));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return left;
}

import sharp from 'sharp';
import { AppError } from '../../core/errors/app-error.js';

/**
 * Обработка картинок чата. Файл от пользователя никогда не сохраняется как есть:
 * тип определяется по сигнатуре, затем libvips декодирует его в пиксели и кодирует заново в WebP.
 * Всё, что не пиксели (EXIF с GPS, ICC, комментарии, данные после конца картинки, polyglot-хвосты), теряется.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Защита от decompression bomb: ~40 Мп (например, 8000×5000). */
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_INPUT_SIDE = 16_384;
const FULL_MAX_SIDE = 1920;
const THUMB_MAX_SIDE = 640;

/** Кастомные смайлики (modules/emojis): маленький исходник, на выходе одна WebP не больше 128×128. */
export const MAX_EMOJI_UPLOAD_BYTES = 256 * 1024;
export const EMOJI_MIN_SIDE = 16;
export const EMOJI_MAX_INPUT_SIDE = 1024;
const EMOJI_SIDE = 128;

/** Аватар сервера (modules/server-icon): обрезка по центру до квадрата, на выходе одна WebP 256×256. */
export const MAX_SERVER_ICON_UPLOAD_BYTES = 2 * 1024 * 1024;
export const SERVER_ICON_MIN_SIDE = 64;
export const SERVER_ICON_MAX_INPUT_SIDE = 4096;
export const SERVER_ICON_SIDE = 256;

export type ImageKind = 'jpeg' | 'png' | 'webp';

// Один поток libvips на картинку и без кэша операций: mediasoup живёт в этом же процессе.
sharp.concurrency(1);
sharp.cache(false);
// Закрыть все декодеры, кроме нужных: SVG/PDF/TIFF/HEIF/RAW и прочие парсеры — лишняя поверхность атаки.
sharp.block({ operation: ['VipsForeignLoad'] });
sharp.unblock({ operation: ['VipsForeignLoadJpeg', 'VipsForeignLoadPng', 'VipsForeignLoadWebp'] });

/** Тип по сигнатуре файла. Расширение и Content-Type от клиента не учитываются. */
export function detectImageKind(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf.toString('latin1', 0, 4) === 'RIFF' &&
    buf.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export type ProcessedImage = {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
};

function decoder(buf: Buffer) {
  // pages: 1 — у анимированного WebP берётся только первый кадр (анимация пока не поддерживается).
  return sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, pages: 1, failOn: 'error' });
}

/** Проверка исходника: сигнатура, заголовок libvips, размеры. Возвращает ширину и высоту (первого кадра). */
async function inspect(buf: Buffer): Promise<{ width: number; height: number }> {
  const kind = detectImageKind(buf);
  if (!kind) {
    throw new AppError('UNSUPPORTED_IMAGE', 415, 'Only PNG, JPEG and WebP images are allowed');
  }
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await decoder(buf).metadata();
  } catch (error) {
    if (error instanceof Error && error.message.includes('pixel limit')) {
      throw new AppError('IMAGE_TOO_BIG', 422, 'Image dimensions are too large');
    }
    throw new AppError('INVALID_IMAGE', 422, 'Image is corrupted or not supported');
  }
  // Заголовок мог не совпасть с сигнатурой (например, внутри RIFF не WebP).
  if (meta.format !== kind) {
    throw new AppError('UNSUPPORTED_IMAGE', 415, 'Only PNG, JPEG and WebP images are allowed');
  }
  const w = meta.width ?? 0;
  const h = meta.pageHeight ?? meta.height ?? 0;
  if (w < 1 || h < 1 || w > MAX_INPUT_SIDE || h > MAX_INPUT_SIDE || w * h > MAX_INPUT_PIXELS) {
    throw new AppError('IMAGE_TOO_BIG', 422, 'Image dimensions are too large');
  }
  return { width: w, height: h };
}

async function encode(buf: Buffer): Promise<ProcessedImage> {
  if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 413, 'Image must be at most 10 MB');
  }
  await inspect(buf);

  try {
    // autoOrient: повернуть по EXIF до того, как метаданные будут отброшены (их не переносим: нет withMetadata).
    const base = decoder(buf).autoOrient();
    const [full, thumb] = await Promise.all([
      base
        .clone()
        .resize({ width: FULL_MAX_SIDE, height: FULL_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer({ resolveWithObject: true }),
      base
        .clone()
        .resize({ width: THUMB_MAX_SIDE, height: THUMB_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72, effort: 4 })
        .toBuffer(),
    ]);
    return { full: full.data, thumb, width: full.info.width, height: full.info.height };
  } catch {
    throw new AppError('INVALID_IMAGE', 422, 'Image is corrupted or not supported');
  }
}

/**
 * Допуск загрузок: сколько файлов одновременно может находиться в памяти процесса (принят + ждёт обработки).
 * Проверяется до чтения тела запроса, поэтому всплеск загрузок не раздувает память: 16 × 10 МБ максимум.
 * Остальные сразу получают 503 UPLOAD_BUSY, клиент повторяет сам.
 */
export const MAX_UPLOADS_IN_FLIGHT = 16;
let inFlight = 0;

export function admitUpload(): () => void {
  if (inFlight >= MAX_UPLOADS_IN_FLIGHT) {
    throw new AppError('UPLOAD_BUSY', 503, 'Server is busy processing images, try again');
  }
  inFlight += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      inFlight -= 1;
    }
  };
}

/**
 * Очередь перекодирования: одновременно обрабатывается одна картинка, чтобы не отнимать CPU у голоса.
 * Длина очереди ограничена допуском (`admitUpload`).
 */
let active = false;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (!active) {
    active = true;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) {
    next();
  } else {
    active = false;
  }
}

export async function processImage(buf: Buffer): Promise<ProcessedImage> {
  await acquire();
  try {
    return await encode(buf);
  } finally {
    release();
  }
}

export type ProcessedEmoji = { data: Buffer; width: number; height: number };

async function encodeEmoji(buf: Buffer): Promise<ProcessedEmoji> {
  if (buf.length === 0 || buf.length > MAX_EMOJI_UPLOAD_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 413, 'Emoji image must be at most 256 KB');
  }
  const { width, height } = await inspect(buf);
  if (Math.min(width, height) < EMOJI_MIN_SIDE) {
    throw new AppError('IMAGE_TOO_SMALL', 422, `Emoji image must be at least ${EMOJI_MIN_SIDE}×${EMOJI_MIN_SIDE}`);
  }
  if (Math.max(width, height) > EMOJI_MAX_INPUT_SIDE) {
    throw new AppError('IMAGE_TOO_BIG', 422, `Emoji image must be at most ${EMOJI_MAX_INPUT_SIDE}×${EMOJI_MAX_INPUT_SIDE}`);
  }
  try {
    const out = await decoder(buf)
      .autoOrient()
      .resize({ width: EMOJI_SIDE, height: EMOJI_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch {
    throw new AppError('INVALID_IMAGE', 422, 'Image is corrupted or not supported');
  }
}

/** Смайлик: та же очередь, что у картинок чата. */
export async function processEmoji(buf: Buffer): Promise<ProcessedEmoji> {
  await acquire();
  try {
    return await encodeEmoji(buf);
  } finally {
    release();
  }
}

async function encodeServerIcon(buf: Buffer): Promise<Buffer> {
  if (buf.length === 0 || buf.length > MAX_SERVER_ICON_UPLOAD_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 413, 'Server icon must be at most 2 MB');
  }
  const { width, height } = await inspect(buf);
  if (Math.min(width, height) < SERVER_ICON_MIN_SIDE) {
    throw new AppError(
      'IMAGE_TOO_SMALL',
      422,
      `Server icon must be at least ${SERVER_ICON_MIN_SIDE}×${SERVER_ICON_MIN_SIDE}`,
    );
  }
  if (Math.max(width, height) > SERVER_ICON_MAX_INPUT_SIDE) {
    throw new AppError(
      'IMAGE_TOO_BIG',
      422,
      `Server icon must be at most ${SERVER_ICON_MAX_INPUT_SIDE}×${SERVER_ICON_MAX_INPUT_SIDE}`,
    );
  }
  try {
    // Всегда ровно SERVER_ICON_SIDE: неквадратное режется по центру, маленькое растягивается.
    return await decoder(buf)
      .autoOrient()
      .resize({ width: SERVER_ICON_SIDE, height: SERVER_ICON_SIDE, fit: 'cover', position: 'centre' })
      .webp({ quality: 90, effort: 4 })
      .toBuffer();
  } catch {
    throw new AppError('INVALID_IMAGE', 422, 'Image is corrupted or not supported');
  }
}

/** Аватар сервера: та же очередь, что у картинок чата. */
export async function processServerIcon(buf: Buffer): Promise<Buffer> {
  await acquire();
  try {
    return await encodeServerIcon(buf);
  } finally {
    release();
  }
}

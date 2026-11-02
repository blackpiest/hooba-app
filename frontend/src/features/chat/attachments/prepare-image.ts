/**
 * Сжатие картинки в браузере перед загрузкой: длинная сторона до 1920 (как у сервера), WebP.
 * Экономит трафик и CPU сервера; безопасность от этого не зависит — сервер всё равно перекодирует сам.
 */

export const CLIENT_MAX_SIDE = 1920;
/** Меньше этого и в пределах 1920 — отправляем как есть: пережатие не даст выигрыша. */
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;
const QUALITY = 0.9;

export function fitWithin(width: number, height: number, maxSide = CLIENT_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Размеры картинки до отправки — чтобы не грузить заведомо отклонённое сервером. */
export function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error("INVALID_IMAGE"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Не получилось (браузер не умеет, битый файл) — возвращается исходный файл, решит сервер. */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    // from-image: поворот по EXIF применяется здесь, иначе фото с телефона легло бы боком.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const target = fitWithin(bitmap.width, bitmap.height);
    const resized = target.width !== bitmap.width || target.height !== bitmap.height;
    if (!resized && file.size <= SKIP_BELOW_BYTES) {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    let blob = await canvasToBlob(canvas, "image/webp", QUALITY);
    // Safari не кодирует WebP и молча отдаёт PNG — тогда JPEG.
    if (!blob || blob.type !== "image/webp") {
      blob = await canvasToBlob(canvas, "image/jpeg", QUALITY);
    }
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || (!resized && blob.size >= file.size)) {
      return file;
    }
    const base = file.name.replace(/\.[^.]*$/, "") || "image";
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}

/**
 * Квадрат для аватара: обрезка по центру (как `fit: cover` на сервере) и уменьшение до `side`.
 * Не получилось — исходный файл: сервер обрежет и пережмёт сам.
 */
export async function prepareSquareImage(file: File, side: number): Promise<File> {
  if (typeof createImageBitmap !== "function") {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const crop = Math.min(bitmap.width, bitmap.height);
    const out = Math.min(side, crop);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      bitmap,
      Math.floor((bitmap.width - crop) / 2),
      Math.floor((bitmap.height - crop) / 2),
      crop,
      crop,
      0,
      0,
      out,
      out,
    );
    let blob = await canvasToBlob(canvas, "image/webp", QUALITY);
    if (!blob || blob.type !== "image/webp") {
      blob = await canvasToBlob(canvas, "image/jpeg", QUALITY);
    }
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      return file;
    }
    const base = file.name.replace(/\.[^.]*$/, "") || "icon";
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}

import { imageSize, prepareSquareImage } from "@/features/chat/attachments/prepare-image";
import {
  MAX_SERVER_ICON_UPLOAD_BYTES,
  SERVER_ICON_ACCEPT,
  SERVER_ICON_MAX_INPUT_SIDE,
  SERVER_ICON_MIN_SIDE,
} from "@/shared/api/server-settings";

const ACCEPTED = SERVER_ICON_ACCEPT.split(",");
/** Исходник больше этого не берём даже для сжатия в браузере. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** Сторона квадрата, который уходит на сервер (сервер ужмёт до 256). */
const CLIENT_ICON_SIDE = 512;

/**
 * Проверка и подготовка аватара сервера: квадрат по центру, WebP до 512×512.
 * Возвращает файл для загрузки или текст ошибки. Сервер всё равно проверит и перекодирует сам.
 */
export async function prepareServerIconFile(file: File): Promise<{ file: File } | { error: string }> {
  if (!ACCEPTED.includes(file.type)) {
    return { error: "Можно загружать только PNG, JPEG и WebP." };
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { error: `Файл больше ${MAX_SOURCE_BYTES / 1024 / 1024} МБ.` };
  }
  let size: { width: number; height: number };
  try {
    size = await imageSize(file);
  } catch {
    return { error: "Файл повреждён или это не картинка." };
  }
  if (Math.min(size.width, size.height) < SERVER_ICON_MIN_SIDE) {
    return { error: `Картинка меньше ${SERVER_ICON_MIN_SIDE}×${SERVER_ICON_MIN_SIDE}.` };
  }
  const prepared = await prepareSquareImage(file, CLIENT_ICON_SIDE);
  // Сжать не вышло — уходит исходник, к нему лимиты сервера.
  if (prepared === file && Math.max(size.width, size.height) > SERVER_ICON_MAX_INPUT_SIDE) {
    return { error: `Картинка больше ${SERVER_ICON_MAX_INPUT_SIDE}×${SERVER_ICON_MAX_INPUT_SIDE}.` };
  }
  if (prepared.size > MAX_SERVER_ICON_UPLOAD_BYTES) {
    return { error: `Файл больше ${MAX_SERVER_ICON_UPLOAD_BYTES / 1024 / 1024} МБ.` };
  }
  return { file: prepared };
}

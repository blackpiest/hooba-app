import { useCallback, useEffect, useRef, useState } from "react";
import {
  discardAttachment,
  isAcceptedImage,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  UploadError,
  uploadAttachment,
  type AttachmentDto,
} from "@/shared/api/attachments";
import { randomClientId } from "@/shared/lib/random-client-id";
import { prepareImageForUpload } from "./prepare-image";

export type TrayItem = {
  localId: string;
  name: string;
  /** blob: превью локального файла до ответа сервера. */
  previewUrl: string;
  /** queued — сервер занят, загрузка повторится сама. */
  status: "uploading" | "queued" | "ready" | "error";
  /** 0..1 */
  progress: number;
  error?: string;
  remote?: AttachmentDto;
};

/** Исходник может быть больше 10 МБ: браузер сожмёт его до 1920px. Предел — чтобы не декодировать гигантов. */
export const MAX_RAW_BYTES = 50 * 1024 * 1024;

/** Сервер перегружен или упёрлись в лимит частоты — повторяем с нарастающей паузой, примерно полторы минуты. */
const RETRYABLE = new Set(["UPLOAD_BUSY", "RATE_LIMITED"]);
const MAX_ATTEMPTS = 12;

export function retryDelayMs(attempt: number, random = Math.random): number {
  const base = Math.min(1000 * 2 ** attempt, 10_000);
  // Разброс ±50%: 50 клиентов, получивших отказ одновременно, не вернутся тоже одновременно.
  return Math.round(base * (0.5 + random()));
}

/** Отбор файлов до загрузки: только картинки PNG/JPEG/WebP, не больше свободных мест в лотке. */
export function pickUploadable(
  files: File[],
  freeSlots: number,
): { accepted: File[]; error: string | null } {
  const accepted: File[] = [];
  let error: string | null = null;
  for (const file of files) {
    if (!isAcceptedImage(file)) {
      error ??= "UNSUPPORTED_IMAGE";
      continue;
    }
    if (file.size > MAX_RAW_BYTES) {
      error ??= "FILE_TOO_LARGE";
      continue;
    }
    if (accepted.length >= freeSlots) {
      error ??= "TOO_MANY_ATTACHMENTS";
      continue;
    }
    accepted.push(file);
  }
  return { accepted, error };
}

/**
 * Лоток картинок composer'а: каждая картинка сжимается в браузере и грузится на сервер сразу после добавления,
 * при отправке сообщения уходят только id. Смена канала или размонтирование отменяет неотправленное.
 */
export function useAttachmentTray(channelId: number) {
  const [items, setItems] = useState<TrayItem[]>([]);
  const itemsRef = useRef<TrayItem[]>([]);
  /** Отмена текущего шага: XHR или таймер повтора. */
  const cancels = useRef(new Map<string, () => void>());

  // Источник правды — ref: два add подряд до перерисовки должны видеть друг друга (лимит 4).
  const update = useCallback((next: (prev: TrayItem[]) => TrayItem[]) => {
    const value = next(itemsRef.current);
    itemsRef.current = value;
    setItems(value);
  }, []);

  const patch = useCallback(
    (localId: string, fields: Partial<TrayItem>) => {
      update((prev) => prev.map((item) => (item.localId === localId ? { ...item, ...fields } : item)));
    },
    [update],
  );

  const alive = useCallback((localId: string) => itemsRef.current.some((item) => item.localId === localId), []);

  const upload = useCallback(
    (localId: string, file: File) => {
      const attemptUpload = (attempt: number) => {
        if (!alive(localId)) return;
        patch(localId, { status: "uploading", progress: 0 });
        const task = uploadAttachment(channelId, file, (progress) => patch(localId, { progress }));
        cancels.current.set(localId, task.abort);
        task.promise
          .then((remote) => {
            cancels.current.delete(localId);
            if (!alive(localId)) {
              // Убрали из лотка, пока грузилось.
              void discardAttachment(remote.id);
              return;
            }
            patch(localId, { status: "ready", progress: 1, remote });
          })
          .catch((cause: unknown) => {
            cancels.current.delete(localId);
            const code = cause instanceof UploadError ? cause.code : "UPLOAD_FAILED";
            if (code === "ABORTED" || !alive(localId)) return;
            if (RETRYABLE.has(code) && attempt + 1 < MAX_ATTEMPTS) {
              patch(localId, { status: "queued", progress: 0 });
              const timer = window.setTimeout(() => attemptUpload(attempt + 1), retryDelayMs(attempt));
              cancels.current.set(localId, () => window.clearTimeout(timer));
              return;
            }
            patch(localId, { status: "error", error: code });
          });
      };
      attemptUpload(0);
    },
    [alive, channelId, patch],
  );

  const add = useCallback(
    (files: File[]): string | null => {
      const { accepted, error } = pickUploadable(files, MAX_ATTACHMENTS_PER_MESSAGE - itemsRef.current.length);
      const fresh = accepted.map((file) => ({
        file,
        item: {
          localId: randomClientId(),
          name: file.name || "image.png",
          previewUrl: URL.createObjectURL(file),
          status: "uploading",
          progress: 0,
        } satisfies TrayItem,
      }));
      if (fresh.length === 0) {
        return error;
      }
      update((prev) => [...prev, ...fresh.map(({ item }) => item)]);
      for (const { file, item } of fresh) {
        void prepareImageForUpload(file).then((prepared) => {
          if (prepared.size > MAX_ATTACHMENT_BYTES) {
            patch(item.localId, { status: "error", error: "FILE_TOO_LARGE" });
            return;
          }
          upload(item.localId, prepared);
        });
      }
      return error;
    },
    [patch, update, upload],
  );

  const remove = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((current) => current.localId === localId);
      if (!item) return;
      cancels.current.get(localId)?.();
      cancels.current.delete(localId);
      if (item.remote) {
        void discardAttachment(item.remote.id);
      }
      URL.revokeObjectURL(item.previewUrl);
      update((prev) => prev.filter((current) => current.localId !== localId));
    },
    [update],
  );

  /** Забрать готовые картинки для отправки и очистить лоток. Ошибочные просто убираются. */
  const takeForSend = useCallback((): AttachmentDto[] => {
    const ready = itemsRef.current.flatMap((item) => (item.status === "ready" && item.remote ? [item.remote] : []));
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.previewUrl);
    }
    update(() => []);
    return ready;
  }, [update]);

  // Смена канала / уход со страницы: всё неотправленное отменить и удалить с сервера.
  useEffect(() => {
    const pending = cancels.current;
    return () => {
      for (const cancel of pending.values()) cancel();
      pending.clear();
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.remote) void discardAttachment(item.remote.id);
      }
      itemsRef.current = [];
      setItems([]);
    };
  }, [channelId]);

  const uploading = items.some((item) => item.status === "uploading" || item.status === "queued");
  const readyCount = items.filter((item) => item.status === "ready").length;
  return { items, add, remove, takeForSend, uploading, readyCount };
}

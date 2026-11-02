import { useCallback } from "react";
import { attachmentSrc, type AttachmentDto } from "@/shared/api/attachments";
import { writeClipboardImage } from "@/shared/lib/clipboard";
import { ContextMenu, MenuItem } from "@/shared/ui";

/** Буфер обмена принимает только PNG: WebP с сервера перекодируется в браузере. */
async function fetchAsPng(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const bitmap = await createImageBitmap(await res.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) {
      throw new Error("encode failed");
    }
    return png;
  } finally {
    bitmap.close();
  }
}

export type ImageMenuState = { x: number; y: number; attachment: AttachmentDto };

/** Меню по ПКМ на картинке (лента и просмотрщик). Пока одна команда — «Копировать изображение». */
export function ImageContextMenu({ menu, onClose }: { menu: ImageMenuState; onClose: () => void }) {
  const copy = useCallback(() => {
    const src = attachmentSrc(menu.attachment.url ?? menu.attachment.thumb_url);
    // Меню закрывается сразу, как «Копировать текст»; скачивание и запись в буфер идут в фоне.
    // clipboard.write вызывается здесь же, в обработчике клика (нужно Safari).
    if (src) {
      void writeClipboardImage(fetchAsPng(src));
    }
    onClose();
  }, [menu.attachment, onClose]);

  return (
    <ContextMenu x={menu.x} y={menu.y} onClose={onClose} aria-label="Изображение" onAction={copy}>
      <MenuItem id="copy" icon="copy">
        Копировать изображение
      </MenuItem>
    </ContextMenu>
  );
}

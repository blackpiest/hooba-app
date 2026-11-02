import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton, Slider, Spinner, toast } from "@/shared/ui";
import { attachmentSrc, type AttachmentDto } from "@/shared/api/attachments";
import { cx } from "@/utils/cx";
import { useIsTouch } from "@/hooks/use-breakpoint";
import { ImageContextMenu, type ImageMenuState } from "./ImageContextMenu";
import { clampPan, nextZoomStep, panForZoomAt, ZOOM_MAX, ZOOM_MIN, type ZoomPan } from "./image-zoom";

const ZERO_PAN: ZoomPan = { x: 0, y: 0 };
/** Сдвиг курсора, с которого нажатие считается перетаскиванием, а не кликом. */
const DRAG_THRESHOLD_PX = 4;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

/** Размер файла для подписи: сервер отдаёт его только в Content-Length, в DTO сообщения его нет. */
function useRemoteFileSize(src: string | null): number | null {
  const [state, setState] = useState<{ src: string; bytes: number } | null>(null);
  useEffect(() => {
    if (!src) {
      return;
    }
    const controller = new AbortController();
    fetch(src, { method: "HEAD", signal: controller.signal })
      .then((res) => {
        const bytes = Number(res.headers.get("content-length"));
        if (res.ok && Number.isFinite(bytes) && bytes > 0) {
          setState({ src, bytes });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [src]);
  return state && state.src === src ? state.bytes : null;
}

/** Скачивает оригинал под исходным именем: через blob, чтобы имя задавал клиент, а не подписанная ссылка. */
async function downloadImage(src: string, name: string): Promise<void> {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error("DOWNLOAD_FAILED");
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Просмотр картинки во весь экран: Esc/клик мимо — закрыть, ←/→ — соседние картинки сообщения. */
export function ImageLightbox({
  attachments,
  index,
  onIndexChange,
  onClose,
}: {
  attachments: AttachmentDto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const current = attachments[index];
  const count = attachments.length;
  /** Полная версия, которую видимый `<img>` уже загрузил и декодировал. До этого он прозрачен, а поверх крутится спиннер. */
  const [decodedSrc, setDecodedSrc] = useState<string | null>(null);
  /** Полная версия не загрузилась: вместо вечного спиннера показываем thumb. */
  const [failedSrcs, setFailedSrcs] = useState<ReadonlySet<string>>(() => new Set());
  /** Предзагруженные соседи держим в ссылках: иначе браузер может отменить загрузку и выбросить декодированное. */
  const preloadedRef = useRef(new Map<string, HTMLImageElement>());
  const [menu, setMenu] = useState<ImageMenuState | null>(null);
  const isTouch = useIsTouch();
  const [downloading, setDownloading] = useState(false);
  /** Клик мимо открытого меню закрывает только меню, а не просмотрщик. */
  const menuOpenAtPressRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  /** Зум привязан к картинке: при смене `id` вид сам возвращается к исходному. */
  const [view, setView] = useState<{ id: string; zoom: number; pan: ZoomPan }>({ id: "", zoom: ZOOM_MIN, pan: { x: 0, y: 0 } });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  /** Отпускание после перетаскивания не должно сработать как клик-зум. */
  const dragMovedRef = useRef(false);
  const zoom = current && view.id === current.id ? view.zoom : ZOOM_MIN;
  const pan = current && view.id === current.id ? view.pan : ZERO_PAN;

  function clampedPan(next: ZoomPan, nextZoom: number): ZoomPan {
    const img = imgRef.current;
    const stage = stageRef.current;
    if (!img || !stage) {
      return next;
    }
    return clampPan(next, nextZoom, { w: img.offsetWidth, h: img.offsetHeight }, { w: stage.clientWidth, h: stage.clientHeight });
  }

  function applyZoom(nextZoom: number, nextPan: ZoomPan) {
    if (!current) {
      return;
    }
    setView({ id: current.id, zoom: nextZoom, pan: nextZoom <= ZOOM_MIN ? ZERO_PAN : clampedPan(nextPan, nextZoom) });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (menu) {
        // Esc и стрелки сначала для меню (его Esc закроет ContextMenu).
        return;
      }
      const onRange = event.target instanceof HTMLInputElement && event.target.type === "range";
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (onRange) {
        // Стрелки на ползунке зума двигают его, а не листают картинки.
        return;
      } else if (event.key === "ArrowLeft" && count > 1) {
        onIndexChange((index - 1 + count) % count);
      } else if (event.key === "ArrowRight" && count > 1) {
        onIndexChange((index + 1) % count);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [count, index, menu, onClose, onIndexChange]);

  const full = current ? attachmentSrc(current.url) : null;

  // Прогреваем кэш соседними картинками: при листании полная версия берётся из кэша браузера.
  useEffect(() => {
    for (const i of [index, (index + 1) % count, (index - 1 + count) % count]) {
      const src = attachmentSrc(attachments[i]?.url);
      if (src && !preloadedRef.current.has(src)) {
        const img = new Image();
        img.src = src;
        preloadedRef.current.set(src, img);
      }
    }
  }, [attachments, count, index]);

  // Видимая картинка показывается только после собственного decode(): без пустого экрана и постепенной отрисовки.
  useEffect(() => {
    const img = imgRef.current;
    if (!full || !img || img.getAttribute("src") !== full) {
      return;
    }
    let alive = true;
    img
      .decode()
      .then(() => alive && setDecodedSrc(full))
      .catch(() => alive && setFailedSrcs((prev) => new Set(prev).add(full)));
    return () => {
      alive = false;
    };
  }, [full, current?.id]);

  const fileSize = useRemoteFileSize(full);
  if (!current) {
    return null;
  }
  const thumb = attachmentSrc(current.thumb_url);
  const failed = full != null && failedSrcs.has(full);
  const loading = full != null && !failed && decodedSrc !== full;
  const shown = failed ? (thumb ?? full) : full ?? thumb;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black/90 pt-safe pb-safe px-safe"
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      onPointerDownCapture={() => {
        menuOpenAtPressRef.current = menu !== null;
      }}
      onClick={(event) => {
        // События React всплывают через портал к родителям в дереве (строка сообщения, лента): не пускаем.
        event.stopPropagation();
        if (event.target === event.currentTarget && !menuOpenAtPressRef.current) onClose();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
        <span className="min-w-0 truncate font-label text-[11px]">
          {current.name}
          <span className="ml-3 text-disabled-text">
            {current.width}×{current.height}
            {fileSize != null ? ` · ${formatFileSize(fileSize)}` : ""}
          </span>
          {count > 1 ? <span className="ml-3 text-disabled-text">{index + 1} / {count}</span> : null}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {isTouch ? (
            // Тач: ПКМ по картинке нет — то же меню по кнопке.
            <IconButton
              icon="more-h"
              label="Действия с картинкой"
              onPress={(event) => {
                const rect = event.target.getBoundingClientRect();
                setMenu({ x: rect.left, y: rect.bottom + 4, attachment: current });
              }}
            />
          ) : null}
          {full ? (
            <Button
              variant="ghost"
              size="sm"
              leadingIcon="download"
              isDisabled={downloading}
              onPress={() => {
                setDownloading(true);
                downloadImage(full, current.name)
                  .catch(() => toast.error("Не удалось скачать картинку"))
                  .finally(() => setDownloading(false));
              }}
            >
              Скачать
            </Button>
          ) : null}
          <IconButton icon="close" label="Закрыть" onPress={onClose} />
        </div>
      </div>
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-2"
        onClick={(event) => {
          if (event.target === event.currentTarget && !menuOpenAtPressRef.current) onClose();
        }}
      >
        {shown ? (
          <img
            ref={imgRef}
            key={current.id}
            src={shown}
            alt={current.name}
            draggable={false}
            className={cx(
              "max-h-full max-w-full touch-none select-none border border-line-strong object-contain",
              loading && "opacity-0",
              dragging ? "cursor-grabbing" : zoom >= ZOOM_MAX ? "cursor-zoom-out" : "cursor-zoom-in",
            )}
            style={{
              aspectRatio: `${current.width} / ${current.height}`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: dragging ? "none" : "transform 150ms ease-out",
            }}
            onPointerDown={(event) => {
              dragMovedRef.current = false;
              if (event.button !== 0 || zoom <= ZOOM_MIN) {
                return;
              }
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y, moved: false };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) {
                return;
              }
              const dx = event.clientX - drag.startX;
              const dy = event.clientY - drag.startY;
              if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
                return;
              }
              if (!drag.moved) {
                drag.moved = true;
                dragMovedRef.current = true;
                setDragging(true);
              }
              applyZoom(zoom, { x: drag.panX + dx, y: drag.panY + dy });
            }}
            onPointerUp={() => {
              dragRef.current = null;
              setDragging(false);
            }}
            onPointerCancel={() => {
              dragRef.current = null;
              setDragging(false);
            }}
            onClick={(event) => {
              if (event.button !== 0 || dragMovedRef.current) {
                dragMovedRef.current = false;
                return;
              }
              const nextZoom = nextZoomStep(zoom);
              if (nextZoom <= ZOOM_MIN) {
                applyZoom(ZOOM_MIN, ZERO_PAN);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              // Центр картинки без сдвига: сдвиг переносит прямоугольник целиком, масштаб — вокруг центра.
              const focus = {
                x: event.clientX - (rect.left + rect.width / 2 - pan.x),
                y: event.clientY - (rect.top + rect.height / 2 - pan.y),
              };
              applyZoom(nextZoom, panForZoomAt(pan, zoom, nextZoom, focus));
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, attachment: current });
            }}
          />
        ) : null}
        {loading ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Spinner size="lg" label="Загрузка картинки" />
          </div>
        ) : null}
        {count > 1 ? (
          <>
            <IconButton
              icon="chevron-left"
              label="Предыдущая картинка"
              variant="solid"
              size="lg"
              className="absolute left-4 z-10 bg-elevated"
              onPress={() => onIndexChange((index - 1 + count) % count)}
            />
            <IconButton
              icon="chevron-right"
              label="Следующая картинка"
              variant="solid"
              size="lg"
              className="absolute right-4 z-10 bg-elevated"
              onPress={() => onIndexChange((index + 1) % count)}
            />
          </>
        ) : null}
      </div>
      <div className="flex shrink-0 justify-center px-4 pb-4 pt-2">
        <Slider
          aria-label="Масштаб"
          className="w-60"
          value={Math.round(zoom * 100)}
          minValue={ZOOM_MIN * 100}
          maxValue={ZOOM_MAX * 100}
          step={10}
          resetValue={ZOOM_MIN * 100}
          formatValue={false}
          onChange={(percent) => {
            const nextZoom = percent / 100;
            applyZoom(nextZoom, { x: pan.x * (nextZoom / zoom), y: pan.y * (nextZoom / zoom) });
          }}
        />
      </div>
      {menu ? <ImageContextMenu key={`${menu.attachment.id}:${menu.x}:${menu.y}`} menu={menu} onClose={() => setMenu(null)} /> : null}
    </div>,
    document.body,
  );
}

import { formatApiError } from "@/shared/api/format-error";
import { Badge, IconButton, Icon, Progress, Tooltip } from "@/shared/ui";
import { cx } from "@/utils/cx";
import type { TrayItem } from "./use-attachment-tray";

/** Карточки картинок над полем ввода: превью, прогресс, ошибка, крестик. */
export function AttachmentTray({ items, onRemove }: { items: TrayItem[]; onRemove: (localId: string) => void }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className="mb-2 flex gap-2 overflow-x-auto border border-line bg-surface p-2" aria-label="Прикреплённые картинки">
      {items.map((item) => (
        <li key={item.localId} className="relative w-28 shrink-0">
          <div className={cx("relative size-28 overflow-hidden border bg-bg", item.status === "error" ? "border-danger" : "border-line-strong")}>
            <img
              src={item.previewUrl}
              alt=""
              className={cx(
                "size-full object-cover transition-opacity",
                (item.status === "uploading" || item.status === "queued") && "opacity-50",
                item.status === "error" && "opacity-30",
              )}
              draggable={false}
            />
            {item.status === "uploading" ? (
              <Progress
                value={Math.max(4, item.progress * 100)}
                aria-label={`Загрузка ${item.name}`}
                className="absolute inset-x-2 bottom-2 w-auto"
              />
            ) : null}
            {item.status === "queued" ? (
              <div className="absolute inset-x-1.5 bottom-1.5 flex justify-center" role="status">
                <Badge>В очереди…</Badge>
              </div>
            ) : null}
            {item.status === "error" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center text-[11px] leading-tight text-danger" role="alert">
                <Icon name="alert" size="lg" />
                <span>{formatApiError(item.error ?? "UPLOAD_FAILED")}</span>
              </div>
            ) : null}
          </div>
          <Tooltip content={item.name} plain>
            <p className="mt-1 truncate text-[11px] text-muted">{item.name}</p>
          </Tooltip>
          <IconButton
            icon="close"
            size="sm"
            variant="solid"
            label={`Убрать ${item.name}`}
            className="absolute right-1 top-1 bg-elevated"
            onPress={() => onRemove(item.localId)}
          />
        </li>
      ))}
    </ul>
  );
}

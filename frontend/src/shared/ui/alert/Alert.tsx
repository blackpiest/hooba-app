import { useState, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { writeClipboardText } from "@/shared/lib/clipboard";
import { IconButton } from "@/shared/ui/button";
import { ContextMenu, MenuItem } from "@/shared/ui/menu";
import { isTouchInput } from "@/hooks/use-breakpoint";

export type AlertTone = "info" | "success" | "warning" | "danger" | "brand";

const TONE: Record<AlertTone, { box: string; mark: string; glyph: string }> = {
  info: { box: "border-info/45 border-l-info bg-info/10", mark: "border-info/55 text-info", glyph: "i" },
  success: { box: "border-success/45 border-l-success bg-success/10", mark: "border-success/55 text-success", glyph: "✓" },
  warning: { box: "border-warning/45 border-l-warning bg-warning/10", mark: "border-warning/55 text-warning", glyph: "!" },
  danger: { box: "border-danger/45 border-l-danger bg-danger/10", mark: "border-danger/55 text-danger", glyph: "×" },
  brand: { box: "border-brand-text/45 border-l-brand-text bg-brand-soft", mark: "border-brand-text/55 text-brand-text", glyph: "i" },
};

export type AlertProps = {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Кнопки/ссылки под текстом (обычно `Button variant="link"`). */
  actions?: ReactNode;
  /** Если задан — показывается крестик закрытия. */
  onClose?: () => void;
  /** Одна строка без заголовка: ограничения, короткие предупреждения. */
  compact?: boolean;
  className?: string;
};

/**
 * Встроенное сообщение внутри страницы или формы (баннер). Для кратковременных уведомлений — `toast()`.
 * `warning` и `danger` объявляются скринридером сразу (role=alert).
 */
export function Alert({ tone = "info", title, children, actions, onClose, compact, className }: AlertProps) {
  const t = TONE[tone];
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  // ПКМ по тексту: копируем выделенное, а без выделения — весь текст сообщения. Кнопки и ссылки не трогаем.
  const onTextContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a") || isTouchInput()) {
      return;
    }
    event.preventDefault();
    const selected = window.getSelection()?.toString() ?? "";
    const text = selected.trim() ? selected : event.currentTarget.innerText;
    setMenu({ x: event.clientX, y: event.clientY, text });
  };

  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-3.5 border border-l-[3px] px-4 text-fg",
        compact ? "items-center py-2.5" : "py-3.5",
        t.box,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx("mt-px grid size-5 shrink-0 place-items-center border font-label text-xs", compact && "mt-0", t.mark)}
      >
        {t.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="ds-selectable" onContextMenu={onTextContextMenu}>
          {title ? <p className="text-[13px] font-semibold leading-snug">{title}</p> : null}
          {children ? <div className={cx("text-xs leading-relaxed", compact ? "text-fg" : "mt-0.5 text-muted")}>{children}</div> : null}
        </div>
        {actions ? <div className="mt-2.5 flex flex-wrap gap-3.5">{actions}</div> : null}
      </div>
      {onClose ? <IconButton icon="close" label="Закрыть" size="sm" onPress={onClose} className="-my-1.5 -mr-2" /> : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          aria-label="Сообщение"
          onAction={() => void writeClipboardText(menu.text)}
        >
          <MenuItem id="copy" icon="copy">
            Копировать
          </MenuItem>
        </ContextMenu>
      ) : null}
    </div>
  );
}

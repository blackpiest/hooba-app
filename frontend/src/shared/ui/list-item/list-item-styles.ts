import { cx } from "@/utils/cx";

export type ListItemState = {
  /** Выбранный пункт (открытый канал). */
  active?: boolean;
  /** Есть непрочитанное: текст ярче и жирнее. */
  unread?: boolean;
  /** Приглушённый (архив, офлайн). */
  muted?: boolean;
  /** Опасное действие (исключить, заблокировать): красный текст и подсветка. */
  danger?: boolean;
  /** `md` — 36px (каналы), `lg` — 46px (участники с двумя строками). */
  size?: "md" | "lg";
};

/** Классы строки списка. Используйте напрямую для `NavLink` и других нестандартных элементов. */
export function listItemClass({ active, unread, muted, danger, size = "md" }: ListItemState = {}) {
  return cx(
    "group relative flex w-full items-center gap-2.5 px-2.5 text-left text-[13px] transition-colors",
    size === "lg" ? "min-h-[46px]" : "min-h-9",
    active
      ? "bg-brand-soft text-fg shadow-[inset_3px_0_0_var(--color-brand)]"
      : danger
        ? "text-danger hover:bg-danger/15"
        : "text-muted hover:bg-surface hover:text-fg",
    unread && !active && "font-semibold text-fg",
    muted && "opacity-50",
  );
}

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { restartAnimation } from "@/utils/restart-animation";
import { Tooltip } from "@/shared/ui/tooltip/Tooltip";

export type TileItem = { id: string };

export type TileGridProps<T extends TileItem> = {
  /** Имя группы для скринридера («Персонаж», «Фон»). */
  label: string;
  items: readonly T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Содержимое плитки (картинка, слои аватара). Плитка квадратная. */
  renderTile: (item: T, index: number) => ReactNode;
  isDisabled?: boolean;
  /** Отдельная плитка недоступна (закрытая рамка): видна, но не выбирается и пропускается стрелками. */
  isItemDisabled?: (item: T) => boolean;
  /**
   * Плитка закрыта (косметика не получена): видна и выбирается, но при выборе трясётся.
   * Что делать дальше (звук, не менять выбор) — решает `onSelect`.
   */
  isItemLocked?: (item: T) => boolean;
  /** Пропорции плитки: квадрат (аватары) или 16:9 (превью окон и экранов). */
  aspect?: "square" | "video";
  /** Имя плитки для скринридера; по умолчанию «<label> <номер>». */
  getLabel?: (item: T, index: number) => string;
  /** Подсказка при наведении и фокусе (например, имя персонажа); не задана или пустая — подсказки нет. */
  getTooltip?: (item: T, index: number) => ReactNode;
  /** Число колонок на узком / широком экране — для навигации стрелками вверх и вниз. */
  columns?: { base: number; wide: number };
  className?: string;
};

/**
 * Сетка плиток-вариантов (выбор аватара, фона): radiogroup, стрелки ←/→ двигают по порядку,
 * ↑/↓ — на строку вверх и вниз. Выбранная плитка обведена рамкой бренда.
 */
export function TileGrid<T extends TileItem>({
  label,
  items,
  selectedId,
  onSelect,
  renderTile,
  isDisabled,
  isItemDisabled,
  isItemLocked,
  aspect = "square",
  getLabel,
  getTooltip,
  columns = { base: 3, wide: 4 },
  className,
}: TileGridProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );

  function select(index: number) {
    const item = items[index];
    if (!item) {
      return;
    }
    if (isItemLocked?.(item)) {
      restartAnimation(refs.current[index]);
    }
    onSelect(item.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const perRow = window.matchMedia("(min-width: 640px)").matches ? columns.wide : columns.base;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: perRow, ArrowUp: -perRow };
    const delta = step[event.key];
    if (delta === undefined) {
      return;
    }
    event.preventDefault();
    let next = Math.min(items.length - 1, Math.max(0, index + delta));
    // Закрытые плитки пропускаем в ту же сторону; дальше края — остаёмся на месте.
    while (next !== index && items[next] && isItemDisabled?.(items[next])) {
      const moved = next + Math.sign(delta);
      if (moved < 0 || moved >= items.length) {
        next = index;
        break;
      }
      next = moved;
    }
    if (items[next] && next !== index) {
      select(next);
      refs.current[next]?.focus();
    }
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx("grid grid-cols-3 gap-3 sm:grid-cols-4", className)}>
      {items.map((item, index) => {
        const selected = item.id === selectedId;
        return (
          <Tooltip key={item.id} content={getTooltip?.(item, index)} plain>
            <button
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={getLabel ? getLabel(item, index) : `${label} ${index + 1}`}
              tabIndex={index === selectedIndex ? 0 : -1}
              disabled={isDisabled || isItemDisabled?.(item)}
              onClick={() => select(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cx(
                "relative cursor-pointer border bg-bg p-1 outline-none",
                aspect === "video" ? "aspect-video" : "aspect-square",
                "transition-[border-color,box-shadow]",
                selected
                  ? "border-brand shadow-[0_0_0_2px_var(--color-brand)]"
                  : "border-line-strong hover:border-muted",
                "focus-visible:[outline:var(--ds-focus-ring)] focus-visible:outline-offset-[3px]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span className="relative block size-full overflow-hidden bg-surface">{renderTile(item, index)}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

import type { CSSProperties } from "react";
import { cx } from "@/utils/cx";
import type { FrameSpec } from "./cosmetics";

/** Название базовой рамки в конструкторе: её нет в каталоге, это «рамка не выбрана». */
export const BASE_FRAME_LABEL = "Стандартная";

/** Общая структура рамки: внутренняя кайма (--frame-inner) и розовый уголок справа сверху. */
const FRAME_BASE =
  "before:pointer-events-none before:absolute before:inset-[3px] before:border before:border-[color:var(--frame-inner)] " +
  "after:absolute after:right-0 after:top-0 after:z-[3] after:size-1.5 after:bg-accent";

/** Базовая рамка — фиолетовая, цвета из токенов бренда; работает и без каталога. */
const BASE_FRAME_CLASS =
  "[--frame:var(--color-brand-hover)] [--frame-line:var(--color-logo-dark)] [--plate-edge:var(--color-brand-text)] " +
  "[--frame-inner:color-mix(in_oklab,var(--color-brand-light)_50%,transparent)] " +
  FRAME_BASE;

/** Hex из каталога с прозрачностью 0..1. */
function withAlpha(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/**
 * Класс и CSS-переменные рамки по спеке из каталога: --frame, --frame-line, --plate-edge, --frame-inner
 * и, если есть свечение, --glow-* для `ds-pc-frame--glow` (styles/ds-utilities.css). null — базовая рамка.
 */
export function frameSkin(frame: FrameSpec | null | undefined): { className: string; style?: CSSProperties } {
  if (!frame) {
    return { className: BASE_FRAME_CLASS };
  }
  const { colors, glow } = frame;
  const style: Record<string, string> = {
    "--frame": colors.frame,
    "--frame-line": colors.line,
    "--plate-edge": colors.plateEdge,
    "--frame-inner": withAlpha(colors.inner, colors.innerAlpha),
  };
  if (glow) {
    Object.assign(style, {
      "--glow-a": withAlpha(glow.colorA, glow.alphaA),
      "--glow-b": withAlpha(glow.colorB, glow.alphaB),
      "--glow-min": `${glow.blurMin}px`,
      "--glow-max": `${glow.blurMax}px`,
      "--glow-period": `${glow.period}s`,
    });
  }
  return { className: cx(FRAME_BASE, glow && "ds-pc-frame--glow"), style: style as CSSProperties };
}

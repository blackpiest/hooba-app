import type { CSSProperties } from "react";
import { cx } from "@/utils/cx";
import { Slime } from "@/shared/ui/slime";

/* ---------- Spinner: «светлячки» ---------- */

const SPINNER_SIZE = { sm: 16, md: 24, lg: 44, xl: 72 } as const;
const FIREFLIES = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Индикатор загрузки внутри блоков и строк: 8 пикселей по кругу, коралловая «голова»
 * и плавно гаснущий шлейф.
 */
export function Spinner({
  size = "md",
  label = "Загрузка",
  className,
}: {
  size?: keyof typeof SPINNER_SIZE;
  label?: string;
  className?: string;
}) {
  const px = SPINNER_SIZE[size];
  const dot = Math.max(3, Math.round(px * 0.2));
  const style = { "--s": `${px}px`, "--px": `${dot}px`, "--r": `${(px - dot) / 2}px` } as CSSProperties;
  return (
    <span
      role="status"
      aria-label={label}
      style={style}
      className={cx("relative inline-block size-(--s) shrink-0", className)}
    >
      {FIREFLIES.map((n) => (
        <i
          key={n}
          aria-hidden="true"
          style={{ "--n": n } as CSSProperties}
          className="ds-orbit absolute left-[calc(50%-var(--px)/2)] top-[calc(50%-var(--px)/2)] size-(--px) bg-brand-text"
        />
      ))}
    </span>
  );
}

/* ---------- LoadingDots ---------- */

/** Три прыгающих пикселя («печатает…», ожидание). */
export function LoadingDots({ label = "Загрузка", className }: { label?: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={cx("inline-flex h-3 items-end gap-1", className)}>
      {[0, 0.12, 0.24].map((delay) => (
        <i
          key={delay}
          aria-hidden="true"
          style={{ "--d": `${delay}s` } as CSSProperties}
          className="ds-pxhop size-1.5 bg-brand-text"
        />
      ))}
    </span>
  );
}

/* ---------- MarkLoader ---------- */

/** Слайм прыгает на месте, тень под ним сжимается. Для загрузки на весь экран (подключение, boot splash). */
export function MarkLoader({
  size = "md",
  label = "Загрузка",
  className,
}: {
  size?: "md" | "lg";
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" aria-label={label} className={cx("inline-flex", className)}>
      <Slime pose="hop" className={size === "lg" ? "w-28" : "w-14"} />
    </span>
  );
}

/* ---------- Skeleton ---------- */

/** Заглушка контента при загрузке. Размер задаётся классами: `<Skeleton className="h-3 w-2/3" />`. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("ds-shimmer bg-surface", className)} />;
}

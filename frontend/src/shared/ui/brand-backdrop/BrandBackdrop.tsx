import type { CSSProperties } from "react";
import { cx } from "@/utils/cx";

/** Светлячки: позиция (% экрана), размер (px), длительность и задержка всплытия (с), цвет. */
const FIREFLIES: { x: number; y: number; s: number; t: number; d: number; c: "brand" | "accent" }[] = [
  { x: 8, y: 78, s: 3, t: 14, d: 0, c: "brand" },
  { x: 15, y: 32, s: 2, t: 18, d: -6, c: "brand" },
  { x: 23, y: 88, s: 2, t: 16, d: -11, c: "accent" },
  { x: 31, y: 55, s: 3, t: 20, d: -3, c: "brand" },
  { x: 38, y: 18, s: 2, t: 15, d: -9, c: "brand" },
  { x: 46, y: 92, s: 2, t: 17, d: -14, c: "brand" },
  { x: 57, y: 70, s: 3, t: 19, d: -5, c: "accent" },
  { x: 64, y: 26, s: 2, t: 16, d: -12, c: "brand" },
  { x: 72, y: 84, s: 2, t: 14, d: -2, c: "brand" },
  { x: 79, y: 46, s: 3, t: 21, d: -16, c: "brand" },
  { x: 86, y: 14, s: 2, t: 18, d: -7, c: "accent" },
  { x: 93, y: 66, s: 2, t: 15, d: -10, c: "brand" },
];

/**
 * Фирменный фон страниц входа и пустых экранов: тёмная «пиксельная ночь» — точечная сетка медленно дрейфует,
 * снизу мягкое свечение бренд-цвета, редкие пиксели-светлячки всплывают и гаснут.
 * Кладётся первым ребёнком контейнера `relative isolate overflow-hidden`.
 */
export function BrandBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cx("pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-bg", className)}>
      <div className="ds-bd-grid absolute -inset-10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_110%,color-mix(in_oklab,var(--color-brand)_22%,transparent),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_45%_35%_at_15%_0%,color-mix(in_oklab,var(--color-brand)_9%,transparent),transparent_70%)]" />
      {FIREFLIES.map((f, index) => (
        <span
          key={index}
          className={cx("ds-bd-firefly absolute", "bg-current", f.c === "accent" ? "text-accent" : "text-brand-text")}
          style={
            {
              left: `${f.x}%`,
              top: `${f.y}%`,
              width: f.s,
              height: f.s,
              animationDuration: `${f.t}s`,
              animationDelay: `${f.d}s`,
            } as CSSProperties
          }
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,color-mix(in_oklab,var(--color-bg)_85%,transparent))]" />
    </div>
  );
}

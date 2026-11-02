import { useMemo, type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Icon } from "@/shared/ui/icon";
import type { BadgeCategory, BadgeIconSpec, BadgeSpec } from "@/shared/ui/profile-card/cosmetics";
import { BADGE_CATEGORY_LABEL } from "./badge-labels";

/** Цвет плашки категории: роль — золото, достижение — бренд, событие — акцент, награда — зелёный. */
const CATEGORY_TONE: Record<BadgeCategory, string> = {
  role: "border-warning/50 bg-warning/15 text-warning",
  achievement: "border-brand/50 bg-brand-soft text-brand-fg",
  event: "border-accent/50 bg-accent/15 text-accent",
  reward: "border-success/40 bg-success/15 text-success",
};

/** Строки пикселей → прямоугольники: соседние пиксели одного цвета в строке сливаются в один. */
function pixelRuns(pixels: string[]): { x: number; y: number; w: number; key: string }[] {
  const runs: { x: number; y: number; w: number; key: string }[] = [];
  pixels.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x] ?? ".";
      let end = x + 1;
      while (end < row.length && row[end] === key) end += 1;
      if (key !== ".") runs.push({ x, y, w: end - x, key });
      x = end;
    }
  });
  return runs;
}

/** Иконка значка по спеке каталога: пиксели рисуются SVG без сглаживания, файл — как пиксельная картинка. */
export function BadgeIcon({ icon, size = 24, className }: { icon: BadgeIconSpec; size?: number; className?: string }) {
  const runs = useMemo(() => ("pixels" in icon ? pixelRuns(icon.pixels) : []), [icon]);
  if ("url" in icon) {
    return (
      <img
        src={icon.url}
        alt=""
        draggable={false}
        width={size}
        height={size}
        className={cx("shrink-0 [image-rendering:pixelated]", className)}
      />
    );
  }
  const width = icon.pixels[0]?.length ?? 1;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${width} ${icon.pixels.length}`}
      shapeRendering="crispEdges"
      className={cx("shrink-0", className)}
    >
      {runs.map((run) => (
        <rect key={`${run.x}:${run.y}`} x={run.x} y={run.y} width={run.w} height={1} fill={icon.palette[run.key]} />
      ))}
    </svg>
  );
}

export function BadgeCategoryTag({ category }: { category: BadgeCategory }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center border px-1.5 font-label text-[9px] uppercase tracking-[0.08em]",
        CATEGORY_TONE[category],
      )}
    >
      {BADGE_CATEGORY_LABEL[category]}
    </span>
  );
}

/**
 * Описание значка: иконка, имя, категория, текст и строка-примечание («Выдан автоматически», дата, как получить).
 * Используется в подсказке при наведении и в панели деталей конструктора.
 */
export function BadgeCard({
  badge,
  note,
  noteIcon,
  locked,
  className,
}: {
  badge: BadgeSpec;
  note?: ReactNode;
  noteIcon?: "lock" | "check" | "info";
  locked?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex items-start gap-3">
        <span className={cx("grid size-12 shrink-0 place-items-center border border-line bg-bg", locked && "opacity-40 grayscale")}>
          <BadgeIcon icon={badge.icon} size={36} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="max-w-full break-words font-heading text-sm leading-tight text-fg">{badge.name}</span>
          <BadgeCategoryTag category={badge.category} />
        </div>
      </div>
      <p className="break-words text-xs leading-relaxed text-muted">{badge.description}</p>
      {note ? (
        <span className="flex min-w-0 items-start gap-1.5 break-words text-xs text-fg">
          {noteIcon ? <Icon name={noteIcon} size="xs" className="mt-0.5 shrink-0 text-muted" /> : null}
          {note}
        </span>
      ) : null}
    </div>
  );
}

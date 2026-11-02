import type { CSSProperties, SVGProps } from "react";
import { cx } from "@/utils/cx";

export type SlimePose = "still" | "hop" | "empty" | "offline";

export type SlimeProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  /** Только для `still`: слайм периодически моргает. */
  blink?: boolean;
  /** Только для `still`: слайм чуть приседает и разгибается (дыхание). */
  breathe?: boolean;
  /** `still` — логотип; `hop` — прыгает на месте (загрузка); `empty` — моргает, с подтёка капает (пустой канал); `offline` — серый, трясётся и растекается (нет сети, ошибка). */
  pose?: SlimePose;
};

/* Спрайт 14×10 («С подтёком»), покадрово по пиксельной сетке. Источник — temp_folder/Простой слайм-html. */
const OUTLINE =
  "M4 0h6v1H4zM2 1h2v1H2zM10 1h2v1h-2zM1 2h1v2H1zM12 2h1v2h-1zM0 4h1v3H0zM13 4h1v3h-1zM1 7h1v1H1zM12 7h1v1h-1zM2 8h6v1H2zM10 8h2v1h-2zM8 9h2v1H8z";
const BODY = "M4 1h6v1H4zM2 2h10v2H2zM1 4h12v2H1zM2 6h10v1H2z";
const SHADE = "M1 6h1v1H1zM12 6h1v1h-1zM2 7h10v1H2zM8 8h2v1H8z";
const EYES = "M4 4h1v2H4zM9 4h1v2H9z";
const EYES_X =
  "M3 4h1v1H3zM5 4h1v1H5zM4 5h1v1H4zM3 6h1v1H3zM5 6h1v1H5zM8 4h1v1H8zM10 4h1v1h-1zM9 5h1v1H9zM8 6h1v1H8zM10 6h1v1h-1z";

function Body() {
  return (
    <>
      <path d={OUTLINE} fill="var(--color-slime-line)" />
      <path d={BODY} fill="var(--color-slime)" />
      <path d={SHADE} fill="var(--color-slime-shade)" />
    </>
  );
}

/** Маскот Hooba — слайм. Размер задаётся классами (`size-*` или `w-*`), высота подстраивается по сетке. */
export function Slime({ pose = "still", blink, breathe, className, style, ...rest }: SlimeProps) {
  const common = { shapeRendering: "crispEdges", "aria-hidden": true } as const;
  if (pose === "still") {
    return (
      <svg viewBox="0 0 14 10" className={cx("size-8 shrink-0", breathe && "ds-slime-breathe", className)} style={style} {...common} {...rest}>
        <Body />
        <path d={EYES} fill="var(--color-slime-line)" className={blink ? "ds-slime-blink" : undefined} />
      </svg>
    );
  }
  if (pose === "offline") {
    const grey = { "--color-slime": "var(--color-slime-off)", "--color-slime-shade": "var(--color-slime-off-shade)" };
    return (
      <svg
        viewBox="0 0 14 10"
        className={cx("w-24 shrink-0 overflow-visible", className)}
        style={{ ...grey, ...style } as CSSProperties}
        {...common}
        {...rest}
      >
        <g className="ds-slime-shake">
          <g className="ds-slime-melt">
            <Body />
            <path d={EYES_X} fill="var(--color-slime-line)" />
          </g>
        </g>
      </svg>
    );
  }
  const hop = pose === "hop";
  return (
    <svg
      viewBox={hop ? "0 -4 14 16" : "0 0 14 15"}
      className={cx("w-24 shrink-0 overflow-visible", className)}
      style={style}
      {...common}
      {...rest}
    >
      {hop ? (
        <>
          <rect x="2" y="11" width="10" height="1" fill="var(--color-slime-line)" className="ds-slime-shadow" />
          <g className="ds-slime-hop">
            <Body />
            <path d={EYES} fill="var(--color-slime-line)" />
          </g>
        </>
      ) : (
        <>
          <Body />
          <path d={EYES} fill="var(--color-slime-line)" className="ds-slime-blink" />
          <rect x="8" y="9" width="2" height="2" fill="var(--color-slime-shade)" className="ds-slime-drop" />
          <path
            d="M6 14h1v1H6zM11 14h1v1h-1zM7 13h1v1H7zM10 13h1v1h-1z"
            fill="var(--color-slime-shade)"
            className="ds-slime-splash"
          />
        </>
      )}
    </svg>
  );
}

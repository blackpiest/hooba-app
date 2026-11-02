import type { SVGProps } from "react";
import { cx } from "@/utils/cx";
import { ICONS, type IconName } from "./icons";

export type IconSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASS: Record<IconSize, string> = {
  xs: "size-[13px]",
  sm: "size-4",
  md: "size-5",
  lg: "size-[26px]",
};

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name" | "children"> & {
  name: IconName;
  /** xs 13 · sm 16 · md 20 (по умолчанию) · lg 26. Для нестандартных размеров — className="size-…". */
  size?: IconSize;
  /** Если иконка несёт смысл сама по себе. По умолчанию декоративная (aria-hidden). */
  title?: string;
};

/**
 * Единственный способ показать иконку в продукте. Цвет — `currentColor`, поэтому красится через text-*.
 * Заменяет `@untitledui/icons` (соответствие имён — в icons.tsx).
 */
export function Icon({ name, size = "md", title, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      className={cx("shrink-0", SIZE_CLASS[size], className)}
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}

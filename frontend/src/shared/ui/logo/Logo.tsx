import { cx } from "@/utils/cx";
import { BrandMark } from "@/shared/ui/brand-mark";

export type LogoProps = {
  size?: "sm" | "md" | "lg";
  /** Слайм моргает и дышит (шапки auth-экранов). */
  animated?: boolean;
  className?: string;
};

const SIZE = {
  sm: { mark: "size-5", text: "text-base", gap: "gap-2" },
  md: { mark: "size-8", text: "text-2xl", gap: "gap-3" },
  lg: { mark: "size-11", text: "text-3xl", gap: "gap-3.5" },
} as const;

/** Логотип: метка бренда + слово «hooba» шрифтом Unbounded. Метка — слайм-маскот. */
export function Logo({ size = "md", animated, className }: LogoProps) {
  const s = SIZE[size];
  return (
    <span className={cx("inline-flex items-center font-heading tracking-tight text-fg", s.gap, s.text, className)}>
      <BrandMark blink={animated} breathe={animated} className={s.mark} />
      <span>hooba</span>
    </span>
  );
}

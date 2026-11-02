import { Separator } from "react-aria-components";
import { cx } from "@/utils/cx";

export type DividerProps = {
  /** Подпись по центру («Сегодня», «Новые сообщения»). Только для горизонтального. */
  label?: string;
  /** `new` — коралловый, для «новые сообщения». */
  tone?: "default" | "new";
  orientation?: "horizontal" | "vertical";
  className?: string;
};

/** Разделитель. Линия, линия с подписью (`label`) или вертикальная (`orientation="vertical"`). */
export function Divider({ label, tone = "default", orientation = "horizontal", className }: DividerProps) {
  if (orientation === "vertical") {
    return <Separator orientation="vertical" className={cx("w-px self-stretch bg-line", className)} />;
  }
  if (!label) {
    return <Separator className={cx("h-px w-full border-0 bg-line", className)} />;
  }
  const line = tone === "new" ? "bg-accent/45" : "bg-line";
  return (
    <div
      role="separator"
      aria-label={label}
      className={cx(
        "flex items-center gap-3.5 font-label text-[9px] uppercase tracking-[0.14em]",
        tone === "new" ? "text-accent" : "text-muted",
        className,
      )}
    >
      <span className={cx("h-px flex-1", line)} />
      <span aria-hidden="true">{label}</span>
      <span className={cx("h-px flex-1", line)} />
    </div>
  );
}

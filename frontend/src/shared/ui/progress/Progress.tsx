import type { ReactNode } from "react";
import { Label, Meter as AriaMeter, ProgressBar } from "react-aria-components";
import { cx } from "@/utils/cx";

export type ProgressTone = "brand" | "success" | "danger";

const TONE: Record<ProgressTone, string> = {
  brand: "bg-brand",
  success: "bg-success",
  danger: "bg-danger",
};

export type ProgressProps = {
  /** 0–100. Без значения (или с `isIndeterminate`) — бегущая полоска. */
  value?: number;
  isIndeterminate?: boolean;
  label?: ReactNode;
  /** Показать процент справа от подписи. */
  showValue?: boolean;
  tone?: ProgressTone;
  "aria-label"?: string;
  className?: string;
};

/** Полоса выполнения (загрузка картинок, длительные операции). */
export function Progress({
  value,
  isIndeterminate,
  label,
  showValue,
  tone = "brand",
  className,
  ...aria
}: ProgressProps) {
  const indeterminate = isIndeterminate || value == null;
  return (
    <ProgressBar
      {...aria}
      value={value ?? 0}
      isIndeterminate={indeterminate}
      className={cx("flex w-full flex-col gap-1.5", className)}
    >
      {({ percentage, valueText }) => (
        <>
          {label || showValue ? (
            <div className="flex justify-between gap-3 font-label text-[10px] uppercase tracking-[0.06em] text-muted">
              {label ? <Label>{label}</Label> : <span />}
              {showValue && !indeterminate ? <span>{valueText}</span> : null}
            </div>
          ) : null}
          <div className="relative h-2 overflow-hidden border border-line bg-bg">
            <div
              className={cx(
                "h-full bg-[repeating-linear-gradient(90deg,transparent_0_6px,#0003_6px_8px)] transition-[width] duration-300",
                TONE[tone],
                indeterminate && "ds-indeterminate",
              )}
              style={indeterminate ? undefined : { width: `${percentage}%` }}
            />
          </div>
        </>
      )}
    </ProgressBar>
  );
}

/* ---------- Meter ---------- */

const SEGMENTS = 28;

export type MeterProps = {
  /** Уровень 0–100 (громкость микрофона в проверке звука). */
  value: number;
  "aria-label": string;
  segments?: number;
  className?: string;
};

/** Сегментный индикатор уровня: зелёный → жёлтый → красный. */
export function Meter({ value, segments = SEGMENTS, className, ...aria }: MeterProps) {
  return (
    <AriaMeter {...aria} value={value} className={cx("flex h-[22px] items-end gap-[3px]", className)}>
      {({ percentage }) => {
        const lit = Math.round((percentage / 100) * segments);
        return (
          <>
            {Array.from({ length: segments }, (_, index) => {
              const on = index < lit;
              const ratio = index / segments;
              return (
                <i
                  key={index}
                  aria-hidden="true"
                  className={cx(
                    "h-full min-w-0 flex-1 transition-colors duration-150",
                    !on && "bg-line",
                    on && (ratio > 0.8 ? "bg-danger" : ratio > 0.6 ? "bg-warning" : "bg-success"),
                  )}
                />
              );
            })}
          </>
        );
      }}
    </AriaMeter>
  );
}

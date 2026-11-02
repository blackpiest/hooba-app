import { forwardRef, type ReactNode } from "react";
import {
  Label,
  Slider as AriaSlider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  type SliderProps as AriaSliderProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";

export type SliderProps = Omit<AriaSliderProps<number>, "className" | "style" | "children" | "value" | "defaultValue" | "onChange" | "onChangeEnd"> & {
  label?: ReactNode;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Вызывается при отпускании ползунка (удобно для сохранения). */
  onChangeEnd?: (value: number) => void;
  /** Вертикальная отметка на дорожке, 0–100 % (например, текущий уровень микрофона относительно порога). */
  marker?: number;
  /** Значение по умолчанию: двойной клик по ползунку или дорожке возвращает его. */
  resetValue?: number;
  /** Как показать значение справа от подписи. `false` — скрыть. */
  formatValue?: ((value: number) => string) | false;
  /** Только для внешней раскладки. */
  className?: string;
};

/**
 * Ползунок значения (громкость, порог микрофона). Поведение — react-aria `Slider`:
 * стрелки, Home/End, PageUp/PageDown, drag. Значение — одно число.
 */
export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(
  { label, value, defaultValue, onChange, onChangeEnd, formatValue = (v) => String(v), marker, resetValue, className, ...props },
  ref,
) {
  return (
    <AriaSlider
      ref={ref}
      {...props}
      value={value}
      defaultValue={defaultValue}
      onChange={(v) => onChange?.(v as number)}
      onChangeEnd={(v) => onChangeEnd?.(v as number)}
      className={cx("group flex min-w-0 flex-col gap-2", className)}
    >
      {label || formatValue !== false ? (
        <div className="flex items-center justify-between gap-3">
          {label ? (
            <Label className="font-label text-[10px] uppercase leading-snug tracking-[0.06em] text-muted group-data-[disabled]:text-disabled-text">
              {label}
            </Label>
          ) : (
            <span />
          )}
          {formatValue ? (
            <SliderOutput className="font-label text-[11px] tabular-nums text-fg group-data-[disabled]:text-disabled-text">
              {({ state }) => formatValue(state.values[0])}
            </SliderOutput>
          ) : null}
        </div>
      ) : null}

      <div
        onDoubleClick={() => {
          if (resetValue != null && !props.isDisabled) {
            onChange?.(resetValue);
            onChangeEnd?.(resetValue);
          }
        }}
      >
      <SliderTrack className="relative h-[18px] w-full cursor-pointer group-data-[disabled]:cursor-not-allowed">
        {({ state }) => (
          <>
            <div
              className={cx(
                "absolute inset-x-0 top-[7px] h-1 bg-line-strong",
                "group-data-[disabled]:[background:var(--ds-hatch),var(--color-disabled-line)]",
              )}
            />
            <div
              className="absolute left-0 top-[7px] h-1 bg-brand group-data-[disabled]:bg-disabled-text"
              style={{ width: `${state.getThumbPercent(0) * 100}%` }}
            />
            {marker != null ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 h-[18px] w-0.5 -translate-x-1/2 bg-success"
                style={{ left: `${Math.min(100, Math.max(0, marker))}%` }}
              />
            ) : null}
            <SliderThumb
              className={cx(
                "top-1/2 h-[18px] w-3 cursor-grab bg-fg shadow-[2px_2px_0_var(--color-accent)] outline-none",
                "data-[dragging]:cursor-grabbing data-[dragging]:shadow-[1px_1px_0_var(--color-accent)]",
                "data-[focus-visible]:[outline:var(--ds-focus-ring)] data-[focus-visible]:outline-offset-[4px]",
                "data-[disabled]:cursor-not-allowed data-[disabled]:bg-disabled-text data-[disabled]:shadow-none",
              )}
            />
          </>
        )}
      </SliderTrack>
      </div>
    </AriaSlider>
  );
});

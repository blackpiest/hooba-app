import type { CSSProperties, ReactNode } from "react";
import { Label, Radio, RadioGroup } from "react-aria-components";
import { cx } from "@/utils/cx";

export type Swatch = {
  value: string;
  label: string;
  /** «Без цвета»: пустой квадрат с пунктиром (значение `value` в этом случае — просто идентификатор). */
  none?: boolean;
};

export type SwatchesProps = {
  label?: ReactNode;
  swatches: readonly Swatch[];
  /** Выбранный цвет (значение `value` одного из swatches). */
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  className?: string;
};

/**
 * Выбор цвета из палитры (цвет роли, образ персонажа). Это radio-группа: стрелки переключают цвет,
 * у каждого цвета есть текстовое имя для скринридера.
 */
export function Swatches({ label, swatches, value, onChange, isDisabled, className }: SwatchesProps) {
  return (
    <RadioGroup
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
      orientation="horizontal"
      aria-label={typeof label === "string" ? label : undefined}
      className={cx("group flex flex-col gap-2", className)}
    >
      {label ? (
        <Label className="font-label text-[10px] uppercase leading-snug tracking-[0.06em] text-muted">{label}</Label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {swatches.map((swatch) => (
          <Radio
            key={swatch.value}
            value={swatch.value}
            aria-label={swatch.label}
            style={{ "--swatch": swatch.none ? "transparent" : swatch.value } as CSSProperties}
            className={cx(
              "relative size-[26px] cursor-pointer bg-(--swatch) outline-none transition-transform",
              swatch.none && "border border-dashed border-muted",
              "data-[hovered]:-translate-y-0.5",
              "data-[selected]:after:absolute data-[selected]:after:inset-1.5 data-[selected]:after:border-2 data-[selected]:after:border-bg",
              "data-[selected]:after:shadow-[0_0_0_1px_#fff8] data-[selected]:after:content-['']",
              "data-[focus-visible]:[outline:var(--ds-focus-ring)] data-[focus-visible]:outline-offset-[3px]",
              "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40",
            )}
          />
        ))}
      </div>
    </RadioGroup>
  );
}

/** Выбор произвольного цвета системной палитрой (дополнение к `Swatches`). Значение — `#rrggbb`. */
export function ColorInput({
  value,
  onChange,
  isDisabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  "aria-label": string;
}) {
  return (
    <input
      type="color"
      aria-label={ariaLabel}
      disabled={isDisabled}
      value={value}
      onChange={(event) => onChange(event.target.value.toLowerCase())}
      className="h-[26px] w-9 cursor-pointer border border-line-strong bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

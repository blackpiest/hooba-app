import type { ReactNode } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon, type IconName } from "@/shared/ui/icon";

export type SegmentOption = {
  value: string;
  label: ReactNode;
  icon?: IconName;
  isDisabled?: boolean;
};

export type SegmentedControlProps = {
  options: readonly SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  /** Имя группы для скринридера (обязательно, если рядом нет видимой подписи). */
  "aria-label"?: string;
  isDisabled?: boolean;
  className?: string;
};

/** Переключатель режима из нескольких вариантов (качество, тема, вид). Всегда выбран ровно один. */
export function SegmentedControl({ options, value, onChange, isDisabled, className, ...aria }: SegmentedControlProps) {
  return (
    <ToggleButtonGroup
      {...aria}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        if (next != null) {
          onChange(String(next));
        }
      }}
      isDisabled={isDisabled}
      className={cx("inline-flex border border-line bg-bg", className)}
    >
      {options.map((option) => (
        <ToggleButton
          key={option.value}
          id={option.value}
          isDisabled={option.isDisabled}
          className={cx(
            "inline-flex min-h-[34px] cursor-pointer items-center gap-2 px-3.5 font-label text-[10px] uppercase tracking-[0.08em] text-muted outline-none",
            "border-l border-line first:border-l-0 data-[hovered]:bg-surface data-[hovered]:text-fg",
            "data-[selected]:bg-brand-soft data-[selected]:text-brand-fg data-[selected]:shadow-[inset_0_-2px_0_var(--color-brand)]",
            "data-[focus-visible]:[outline:var(--ds-focus-ring)] data-[focus-visible]:-outline-offset-2",
            "data-[disabled]:cursor-not-allowed data-[disabled]:text-disabled-text",
          )}
        >
          {option.icon ? <Icon name={option.icon} size="sm" /> : null}
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

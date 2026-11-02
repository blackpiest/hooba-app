import { forwardRef, type ReactNode } from "react";
import { Checkbox as AriaCheckbox, type CheckboxProps as AriaCheckboxProps } from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon } from "@/shared/ui/icon";

export type CheckboxProps = Omit<AriaCheckboxProps, "className" | "style" | "children"> & {
  /** Текст рядом с флажком. Без него обязателен aria-label. */
  children?: ReactNode;
  /** Пояснение мелким шрифтом под текстом. */
  description?: ReactNode;
  /** `card` — флажок внутри карточки с рамкой; выбранная карточка подсвечивается. */
  variant?: "default" | "card";
  /** Только для внешней раскладки. */
  className?: string;
};

/**
 * Флажок дизайн-системы. Поведение — react-aria (клавиатура, indeterminate, форма).
 * Состояния: hover, focus-visible, selected, indeterminate, invalid, disabled (штриховка + пунктир).
 */
export const Checkbox = forwardRef<HTMLLabelElement, CheckboxProps>(function Checkbox(
  { children, description, variant = "default", className, ...props },
  ref,
) {
  return (
    <AriaCheckbox
      ref={ref}
      {...props}
      className={cx(
        "group inline-flex cursor-pointer items-start gap-3 text-[13px] leading-snug text-fg",
        "data-[disabled]:cursor-not-allowed data-[disabled]:text-disabled-text",
        variant === "card" &&
          "flex border border-line bg-surface p-3.5 transition-colors " +
            "data-[selected]:border-brand data-[selected]:bg-brand-soft " +
            "data-[disabled]:border-dashed data-[disabled]:border-disabled-line data-[disabled]:[background:var(--ds-hatch),var(--color-bg)]",
        className,
      )}
    >
      {({ isSelected, isIndeterminate }) => (
        <>
          <span
            className={cx(
              "mt-px grid size-[18px] shrink-0 place-items-center border border-line-strong bg-surface transition-colors",
              "group-data-[hovered]:border-muted",
              "group-data-[focus-visible]:[outline:var(--ds-focus-ring)] group-data-[focus-visible]:outline-offset-[3px]",
              "group-data-[invalid]:border-danger",
              (isSelected || isIndeterminate) && "border-brand bg-brand group-data-[hovered]:border-brand-light",
              "group-data-[disabled]:border-dashed group-data-[disabled]:border-disabled-line",
              "group-data-[disabled]:[background:var(--ds-hatch),var(--color-bg)]",
            )}
          >
            {isIndeterminate ? (
              <Icon name="minus" strokeWidth={3} className="size-3 text-on-brand group-data-[disabled]:text-disabled-text" />
            ) : isSelected ? (
              <Icon name="check" strokeWidth={3} className="size-3 text-on-brand group-data-[disabled]:text-disabled-text" />
            ) : null}
          </span>
          {children || description ? (
            <span className="min-w-0 flex-1">
              {children}
              {description ? (
                <small className="mt-0.5 block text-[11px] text-muted group-data-[disabled]:text-disabled-text">
                  {description}
                </small>
              ) : null}
            </span>
          ) : null}
        </>
      )}
    </AriaCheckbox>
  );
});

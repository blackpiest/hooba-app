import { forwardRef, type ReactNode } from "react";
import {
  FieldError,
  Label,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Text,
  type RadioGroupProps as AriaRadioGroupProps,
  type RadioProps as AriaRadioProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";

/** «Срезанный октагон»: radio отличается от квадратного checkbox, не нарушая запрет на скругления. */
const OCTAGON = "[clip-path:polygon(30%_0,70%_0,100%_30%,100%_70%,70%_100%,30%_100%,0_70%,0_30%)]";

export type RadioProps = Omit<AriaRadioProps, "className" | "style" | "children"> & {
  children?: ReactNode;
  description?: ReactNode;
  /** `card` — вариант в рамке-карточке; выбранная подсвечивается (качество, тариф). */
  variant?: "default" | "card";
  /**
   * Вариант закрыт (титул не получен): выглядит как неактивный, но нажимается — группа получает `onChange`
   * и сама решает, что делать (звук, тряска, не менять выбор).
   */
  isLocked?: boolean;
  className?: string;
};

export const Radio = forwardRef<HTMLLabelElement, RadioProps>(function Radio(
  { children, description, variant = "default", isLocked, className, ...props },
  ref,
) {
  return (
    <AriaRadio
      ref={ref}
      {...props}
      className={cx(
        "group inline-flex cursor-pointer items-start gap-3 text-[13px] leading-snug text-fg",
        "data-[disabled]:cursor-not-allowed data-[disabled]:text-disabled-text",
        variant === "card" &&
          "flex border border-line bg-surface p-3.5 transition-colors data-[selected]:border-brand data-[selected]:bg-brand-soft " +
            "data-[disabled]:border-dashed data-[disabled]:border-disabled-line data-[disabled]:[background:var(--ds-hatch),var(--color-bg)]",
        isLocked && "cursor-not-allowed text-disabled-text",
        isLocked &&
          variant === "card" &&
          "border-dashed border-disabled-line [background:var(--ds-hatch),var(--color-bg)] data-[selected]:border-disabled-line",
        className,
      )}
    >
      {({ isSelected }) => (
        <>
          <span
            className={cx(
              "mt-px grid size-[18px] shrink-0 place-items-center bg-line-strong transition-colors",
              OCTAGON,
              "group-data-[hovered]:bg-muted",
              "group-data-[focus-visible]:[outline:var(--ds-focus-ring)] group-data-[focus-visible]:outline-offset-[3px]",
              isSelected && "bg-brand group-data-[hovered]:bg-brand-light",
              "group-data-[disabled]:bg-disabled-line",
              isLocked && "bg-disabled-line group-data-[hovered]:bg-disabled-line",
            )}
          >
            <span
              className={cx(
                "grid size-4 place-items-center bg-surface",
                OCTAGON,
                "group-data-[disabled]:[background:var(--ds-hatch),var(--color-bg)]",
                isLocked && "[background:var(--ds-hatch),var(--color-bg)]",
              )}
            >
              {isSelected ? (
                <span className={cx("size-2 bg-brand-light group-data-[disabled]:bg-disabled-text", OCTAGON)} />
              ) : null}
            </span>
          </span>
          {children || description ? (
            <span className="min-w-0 flex-1">
              {children}
              {description ? (
                <small
                  className={cx(
                    "mt-0.5 block text-[11px] text-muted group-data-[disabled]:text-disabled-text",
                    isLocked && "text-disabled-text",
                  )}
                >
                  {description}
                </small>
              ) : null}
            </span>
          ) : null}
        </>
      )}
    </AriaRadio>
  );
});

export type RadioGroupProps = Omit<AriaRadioGroupProps, "className" | "style" | "children"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Радио — `<Radio value="…">`. */
  children: ReactNode;
  className?: string;
};

/** Группа радио-кнопок. По умолчанию вертикальная; `orientation="horizontal"` — в строку. */
export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(
  { label, hint, error, children, className, orientation = "vertical", isInvalid, ...props },
  ref,
) {
  const hasError = error != null && error !== false;
  return (
    <AriaRadioGroup
      ref={ref}
      {...props}
      orientation={orientation}
      isInvalid={hasError ? true : isInvalid}
      className={cx("group flex flex-col gap-2 text-left", className)}
    >
      {label ? (
        <Label className="font-label text-[10px] uppercase leading-snug tracking-[0.06em] text-muted group-data-[disabled]:text-disabled-text">
          {label}
        </Label>
      ) : null}
      <div className={cx("flex gap-3", orientation === "horizontal" ? "flex-row flex-wrap gap-x-8" : "flex-col")}>
        {children}
      </div>
      {hint && !hasError ? (
        <Text slot="description" className="text-[11px] leading-relaxed text-muted">
          {hint}
        </Text>
      ) : null}
      <FieldError className="text-[11px] leading-relaxed text-danger">{hasError ? error : undefined}</FieldError>
    </AriaRadioGroup>
  );
});

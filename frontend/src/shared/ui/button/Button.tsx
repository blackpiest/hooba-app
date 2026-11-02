import { forwardRef } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon, type IconName } from "@/shared/ui/icon";

export type ButtonVariant = "primary" | "special" | "secondary" | "ghost" | "danger" | "danger-ghost" | "link" | "plate";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex select-none items-center justify-center border border-transparent font-ui font-semibold " +
  "whitespace-nowrap ds-focus cursor-pointer data-[disabled]:cursor-default data-[pending]:cursor-progress";

/** Отклик на нажатие: кнопка чуть опускается (как в референсе дизайн-системы). */
const PRESS = "data-[pressed]:translate-y-px";

const VARIANT: Record<ButtonVariant, string> = {
  /** Главное действие экрана: плоский фон бренда, без объёма. */
  primary:
    PRESS + " bg-brand-hover text-on-brand data-[hovered]:bg-brand-light data-[pressed]:bg-brand data-[disabled]:opacity-40",
  /** Акцентная кнопка: пиксельная «клавиша» с фаской (`ds-key`). Для редких заметных действий, не для рядов форм. */
  special:
    "ds-key bg-brand-hover text-on-brand data-[hovered]:bg-brand-light data-[pressed]:bg-brand-hover data-[disabled]:opacity-40",
  secondary:
    PRESS + " border-line-strong bg-bg text-fg data-[hovered]:border-muted data-[hovered]:bg-surface data-[disabled]:opacity-40",
  ghost: PRESS + " text-muted data-[hovered]:bg-elevated data-[hovered]:text-fg data-[disabled]:opacity-40",
  /** Необратимое действие (удалить, бан). */
  danger:
    PRESS + " bg-danger text-on-accent data-[hovered]:brightness-110 data-[pressed]:brightness-90 data-[disabled]:opacity-40",
  "danger-ghost": PRESS + " text-danger data-[hovered]:bg-danger/15 data-[disabled]:opacity-40",
  /** Табличка статуса на рамке мини-профиля: тёмная, с пиксельным контуром (`ds-px-plate`). */
  plate:
    "ds-px-plate h-[26px] gap-[7px] border-0 px-[9px] font-label text-[9px] font-normal uppercase tracking-[0.1em] text-fg data-[hovered]:bg-elevated data-[disabled]:opacity-40",
  link: "min-h-0 border-0 border-b-current p-0 font-label font-normal uppercase tracking-[0.1em] text-[10px] leading-snug text-brand-text data-[hovered]:text-fg data-[disabled]:opacity-40",
};

/** Размеры: sm 34 · md 44 · lg 54. Фаска `special` растёт вместе с размером. */
const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-[34px] gap-2 px-3.5 text-xs [--press:3px]",
  md: "min-h-11 gap-[11px] px-5 text-[13px]",
  lg: "min-h-[54px] gap-[11px] px-6 text-sm [--press:6px]",
};

export type ButtonProps = Omit<AriaButtonProps, "className" | "style"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Занять всю ширину контейнера. */
  fullWidth?: boolean;
  /** Иконка слева / справа от текста. */
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  /** Только для внешней раскладки (отступы, ширина). Цвета и формы не переопределять. */
  className?: string;
};

/**
 * Кнопка дизайн-системы. Поведение — react-aria (клавиатура, фокус, pending).
 * Состояние загрузки — `isPending`: кнопка блокируется, текст скрывается, бегут три пикселя.
 * Обработчик клика — `onPress` (не onClick).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", fullWidth, leadingIcon, trailingIcon, className, children, ...props },
  ref,
) {
  return (
    <AriaButton
      ref={ref}
      {...props}
      className={cx(
        BASE,
        VARIANT[variant],
        variant !== "link" && variant !== "plate" && SIZE[size],
        fullWidth && "flex w-full",
        className,
      )}
    >
      {(state) => (
        <>
          {leadingIcon ? <Icon name={leadingIcon} className="size-[17px]" /> : null}
          <span className={cx("contents", state.isPending && "invisible")}>
            {typeof children === "function" ? children(state) : children}
          </span>
          {trailingIcon ? <Icon name={trailingIcon} className="size-[17px]" /> : null}
          {state.isPending ? <span className="ds-wave" aria-hidden="true" /> : null}
        </>
      )}
    </AriaButton>
  );
});

import { forwardRef } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon, type IconName, type IconSize } from "@/shared/ui/icon";

export type IconButtonVariant = "ghost" | "solid" | "danger" | "danger-solid";
type Size = "xs" | "sm" | "md" | "lg";

const BASE =
  "inline-grid shrink-0 place-items-center text-muted ds-focus cursor-pointer " +
  "transition-colors data-[hovered]:bg-elevated data-[hovered]:text-fg " +
  "data-[disabled]:cursor-default data-[disabled]:opacity-40";

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: "",
  solid: "border border-line-strong bg-surface",
  danger: "data-[hovered]:bg-danger/15 data-[hovered]:text-danger",
  /** Необратимое действие, заметное сразу (прекратить просмотр): красная заливка, как у `Button variant="danger"`. */
  "danger-solid":
    "bg-danger text-on-accent data-[hovered]:bg-danger data-[hovered]:text-on-accent data-[hovered]:brightness-110 data-[pressed]:brightness-90",
};

const SIZE: Record<Size, { box: string; icon: IconSize }> = {
  /** Высота чипа роли (22px). */
  xs: { box: "size-[22px]", icon: "xs" },
  sm: { box: "size-7", icon: "sm" },
  md: { box: "size-[34px]", icon: "sm" },
  lg: { box: "size-11", icon: "md" },
};

export type IconButtonProps = Omit<AriaButtonProps, "className" | "style" | "children"> & {
  icon: IconName;
  /** Обязателен: у кнопки без текста имя задаёт aria-label. */
  label: string;
  variant?: IconButtonVariant;
  size?: Size;
  /** Состояние «включено» для переключателей (микрофон, форматирование). Ставит aria-pressed. */
  pressed?: boolean;
  className?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = "ghost", size = "md", pressed, className, ...props },
  ref,
) {
  const s = SIZE[size];
  return (
    <AriaButton
      ref={ref}
      {...props}
      aria-label={label}
      aria-pressed={pressed}
      className={cx(
        BASE,
        VARIANT[variant],
        s.box,
        pressed &&
          (variant === "danger" ? "bg-danger/20 text-danger" : "bg-brand-soft text-brand-text"),
        className,
      )}
    >
      <Icon name={icon} size={s.icon} />
    </AriaButton>
  );
});

import { forwardRef, type ReactNode } from "react";
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from "react-aria-components";
import { cx } from "@/utils/cx";

export type SwitchProps = Omit<AriaSwitchProps, "className" | "style" | "children"> & {
  children?: ReactNode;
  /** Только для внешней раскладки. */
  className?: string;
};

/** Переключатель «вкл / выкл». Применяется сразу (не в форме «Сохранить»), для формы лучше Checkbox. */
export const Switch = forwardRef<HTMLLabelElement, SwitchProps>(function Switch({ children, className, ...props }, ref) {
  return (
    <AriaSwitch
      ref={ref}
      {...props}
      className={cx(
        "group inline-flex cursor-pointer items-center gap-3 text-[13px] text-fg",
        "data-[disabled]:cursor-not-allowed data-[disabled]:text-disabled-text",
        className,
      )}
    >
      <span
        className={cx(
          "relative h-[22px] w-10 shrink-0 border border-line-strong bg-bg transition-colors",
          "group-data-[hovered]:border-muted",
          "group-data-[focus-visible]:[outline:var(--ds-focus-ring)] group-data-[focus-visible]:outline-offset-[3px]",
          "group-data-[selected]:border-brand group-data-[selected]:bg-brand-soft",
          "group-data-[disabled]:border-dashed group-data-[disabled]:border-disabled-line",
          "group-data-[disabled]:[background:var(--ds-hatch),var(--color-bg)]",
          // ползунок
          "after:absolute after:left-[3px] after:top-[3px] after:size-3.5 after:bg-muted after:transition-[translate,background-color]",
          "group-data-[selected]:after:translate-x-[18px] group-data-[selected]:after:bg-brand-text",
          "group-data-[disabled]:after:bg-disabled-line group-data-[disabled]:group-data-[selected]:after:bg-disabled-text",
        )}
      />
      {children}
    </AriaSwitch>
  );
});

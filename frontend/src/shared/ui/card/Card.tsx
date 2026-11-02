import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

export type CardVariant = "default" | "outline" | "dashed" | "selected";

const VARIANT: Record<CardVariant, string> = {
  /** Поверхность с жёсткой тенью — «приподнятая» карточка. */
  default: "border-2 border-bg bg-surface shadow-card",
  /** Без тени: плотные списки и настройки. */
  outline: "border border-line bg-transparent",
  /** Пунктир — «свободно / можно добавить». */
  dashed: "border border-dashed border-brand-text/60 bg-surface/90",
  /** Светлая инверсия + коралловый уголок. */
  selected:
    "border-2 border-bg bg-paper text-on-paper shadow-card after:absolute after:-bottom-0.5 after:-right-0.5 after:size-[13px] after:bg-accent after:[clip-path:polygon(100%_0,100%_100%,0_100%)]",
};

export type CardProps = {
  variant?: CardVariant;
  /** Карточка приподнимается при наведении (кликабельная). */
  interactive?: boolean;
  children: ReactNode;
  className?: string;
};

export function Card({ variant = "default", interactive, children, className }: CardProps) {
  return (
    <div
      className={cx(
        "relative p-4 transition-transform duration-300",
        VARIANT[variant],
        interactive && "hover:-translate-y-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------- Section: блок настроек ---------- */

export type SectionProps = {
  title: ReactNode;
  /** Справа в шапке: бейдж или кнопка. */
  actions?: ReactNode;
  /** Нижняя панель (Сбросить / Сохранить). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Блок настроек с шапкой, телом и нижней панелью действий. */
export function Section({ title, actions, footer, children, className }: SectionProps) {
  return (
    <section className={cx("border border-line bg-surface", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-[18px] py-3.5">
        <h3 className="font-heading text-sm tracking-tight">{title}</h3>
        {actions}
      </div>
      <div className="p-[18px]">{children}</div>
      {footer ? <div className="flex justify-end gap-2.5 border-t border-line bg-bg px-[18px] py-3">{footer}</div> : null}
    </section>
  );
}

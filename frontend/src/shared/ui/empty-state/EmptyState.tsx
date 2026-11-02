import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Icon, type IconName } from "@/shared/ui/icon";

export type EmptyStateProps = {
  /** Иконка в «прицеле». По умолчанию плюс — «здесь можно что-то добавить». */
  icon?: IconName;
  /** Своя иллюстрация вместо иконки (например, слайм). */
  illustration?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Кнопка действия (обычно `Button size="sm"`). */
  action?: ReactNode;
  /** `dashed` — пунктирная рамка «свободное место»; `plain` — без рамки. */
  variant?: "plain" | "dashed";
  /** Компактная строка внутри списка или панели: только текст в пунктирной рамке, без иконки. */
  compact?: boolean;
  className?: string;
};

/** Пустое состояние: пустой канал, пустой поиск, нет участников. */
export function EmptyState({ icon = "plus", illustration, title, description, action, variant = "plain", compact, className }: EmptyStateProps) {
  if (compact) {
    return (
      <p className={cx("border border-dashed border-line-strong px-3 py-4 text-center text-xs text-muted", className)}>{title}</p>
    );
  }
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-4 px-5 py-9 text-center",
        variant === "dashed" && "border border-dashed border-brand-text/60 bg-surface/90",
        className,
      )}
    >
      {illustration ?? (
        <span className="grid size-12 place-items-center border border-[#67578e] text-[#b6a6ee] outline outline-2 outline-offset-[5px] outline-[#aaa0d5]/60">
          <Icon name={icon} size="lg" />
        </span>
      )}
      <div>
        <p className="font-heading text-[15px] tracking-tight text-fg">{title}</p>
        {description ? <p className="mx-auto mt-2 max-w-[34ch] text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

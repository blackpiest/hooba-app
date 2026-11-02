import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

/** Малая заглавная подпись группы настроек («Устройства», «Громкость»). */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("font-label text-[10px] uppercase leading-snug tracking-[0.1em] text-muted", className)}>{children}</p>
  );
}

/**
 * Группа полей формы: заголовок обычным текстом (крупнее подписей полей), пояснение и элемент справа
 * (переключатель режима, «Сбросить»). Отделяет группы друг от друга, не споря с подписями `TextField`.
 */
export function FieldGroup({
  title,
  description,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Справа от заголовка. */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-fg">{title}</h3>
          {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Строка настройки: название и пояснение слева, элемент управления справа (обычно `Switch` без текста
 * с `aria-label`, либо кнопка). Рамка вокруг строки — для одиночных настроек в разделе.
 */
export function SettingRow({
  title,
  description,
  children,
  bordered = true,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Элемент управления. */
  children: ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center justify-between gap-4", bordered && "border border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

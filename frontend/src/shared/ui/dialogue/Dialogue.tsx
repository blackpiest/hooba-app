import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Slime } from "@/shared/ui/slime";

export type DialogueProps = {
  /** Реплики: каждая — отдельная строка с маркером `*`. */
  lines: ReactNode[];
  /** Кнопки под репликами. */
  actions?: ReactNode;
  /** Иконка слева; по умолчанию — слайм-маскот, который моргает и дышит. */
  icon?: ReactNode;
  className?: string;
};

/** RPG-диалог (фирменный элемент): рамка, маскот слева, реплики с `*` и мигающая стрелка «дальше». Для приветствий и подсказок на auth-экранах. */
export function Dialogue({ lines, actions, icon, className }: DialogueProps) {
  return (
    <div role="status" className={cx("relative flex items-start gap-4 border-2 border-fg bg-bg p-5 pb-6", className)}>
      <span aria-hidden="true" className="w-9 shrink-0 text-brand">
        {icon ?? <Slime blink breathe className="w-full" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="ds-selectable space-y-2.5">
          {lines.map((line, index) => (
            <p key={index} className="relative pl-4 font-label text-[11px] leading-[1.85] text-fg">
              <span aria-hidden="true" className="absolute left-0 text-muted">
                *
              </span>
              {line}
            </p>
          ))}
        </div>
        {actions ? <div className="mt-3 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      <span
        aria-hidden="true"
        className="absolute right-2.5 bottom-2 border-x-[5px] border-t-[5px] border-x-transparent border-t-fg [animation:ds-pc-blink_2s_steps(1)_infinite]"
      />
    </div>
  );
}

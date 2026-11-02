import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cx } from "@/utils/cx";

export type ComposerProps = {
  /** Предупреждение над полем (ограничение канала, лимит вложений). */
  notice?: ReactNode;
  /** Лоток вложений (`AttachmentTray`). */
  tray?: ReactNode;
  /** Нижняя панель: форматирование, эмодзи, кнопка отправки. */
  toolbar?: ReactNode;
  /** Поле ввода (`ComposerTextarea`). */
  children: ReactNode;
  className?: string;
};

/**
 * Рамка поля отправки сообщения: уведомление, лоток вложений, поле, нижняя панель.
 * При фокусе внутри подсвечивается рамкой бренда.
 */
export function Composer({ notice, tray, toolbar, children, className }: ComposerProps) {
  return (
    <div
      className={cx(
        "border border-line-strong bg-surface transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-soft",
        className,
      )}
    >
      {notice ? <div className="border-b border-line px-3.5 py-1.5 font-label text-[10px] text-warning">{notice}</div> : null}
      {tray ? <div className="px-3 pt-3">{tray}</div> : null}
      {children}
      {toolbar ? <div className="flex items-center gap-1 border-t border-line px-1.5 py-1">{toolbar}</div> : null}
    </div>
  );
}

export type ComposerTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Многострочное поле внутри `Composer`: без собственной рамки, растёт по содержимому снаружи. */
export const ComposerTextarea = forwardRef<HTMLTextAreaElement, ComposerTextareaProps>(function ComposerTextarea(
  { className, rows = 1, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      {...props}
      className={cx(
        "block max-h-60 min-h-[42px] w-full resize-none bg-transparent px-3.5 py-[11px] text-sm leading-relaxed text-fg outline-none placeholder:text-disabled-text disabled:cursor-not-allowed disabled:text-disabled-text",
        className,
      )}
    />
  );
});

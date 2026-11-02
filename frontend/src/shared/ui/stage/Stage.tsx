import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

export type StageProps = {
  /** Метки в левом верхнем углу (`Badge variant="live"`, имя, качество). */
  overlay?: ReactNode;
  /** Панель управления внизу по центру (кнопки громкости, на весь экран). */
  controls?: ReactNode;
  /** Видео или заглушка. */
  children?: ReactNode;
  className?: string;
};

/** Каркас просмотра трансляции экрана: 16:9, тёмный фон с сеткой, метки сверху и панель управления снизу. */
export function Stage({ overlay, controls, children, className }: StageProps) {
  return (
    <div
      className={cx(
        "relative grid aspect-video place-items-center overflow-hidden border border-line-strong bg-black",
        "bg-[linear-gradient(#ffffff05_1px,transparent_1px),linear-gradient(90deg,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px]",
        className,
      )}
    >
      {children}
      {overlay ? <div className="absolute left-2.5 top-2.5 flex items-center gap-2">{overlay}</div> : null}
      {controls ? (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2.5">
          {controls}
        </div>
      ) : null}
    </div>
  );
}

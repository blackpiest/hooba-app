import { Separator, Toolbar as AriaToolbar, type ToolbarProps as AriaToolbarProps } from "react-aria-components";
import { cx } from "@/utils/cx";

export type ToolbarProps = Omit<AriaToolbarProps, "className" | "style"> & { className?: string };

/**
 * Панель инструментов (форматирование текста). Стрелки ←/→ переходят между кнопками, Tab выходит из панели —
 * react-aria. Внутри — `IconButton`, между группами — `ToolbarDivider`.
 */
export function Toolbar({ className, ...props }: ToolbarProps) {
  return <AriaToolbar {...props} className={cx("inline-flex items-center gap-0.5 border border-line bg-bg p-[3px]", className)} />;
}

export function ToolbarDivider() {
  return <Separator orientation="vertical" className="mx-[3px] my-1 w-px self-stretch bg-line" />;
}

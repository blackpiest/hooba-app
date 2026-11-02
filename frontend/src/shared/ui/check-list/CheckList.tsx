import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Checkbox } from "@/shared/ui/checkbox";

/** Рамка со скроллом для списка `CheckListItem` (выбор участников, ролей). */
export function CheckList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("max-h-52 divide-y divide-line overflow-y-auto border border-line", className)}>{children}</div>
  );
}

export function CheckListItem({
  checked,
  disabled,
  onChange,
  children,
  trailing,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** Подпись строки; обрезается по ширине. */
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <Checkbox
      isSelected={checked}
      isDisabled={disabled}
      onChange={onChange}
      className="flex w-full items-center px-3 py-2 data-[hovered]:bg-elevated"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {trailing ? <span className="shrink-0 text-xs text-muted">{trailing}</span> : null}
      </span>
    </Checkbox>
  );
}

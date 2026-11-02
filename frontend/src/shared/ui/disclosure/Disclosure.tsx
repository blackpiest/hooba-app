import type { HTMLAttributes, ReactNode, Ref } from "react";
import { Button, Disclosure as AriaDisclosure, DisclosurePanel, Heading } from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon } from "@/shared/ui/icon";

export type DisclosureProps = {
  /** Заголовок строки (кнопка раскрытия). */
  title: ReactNode;
  /** Слева от заголовка: цвет роли, иконка. */
  leading?: ReactNode;
  /** Слева от кнопки раскрытия, вне неё: ручка перетаскивания (`DragHandle`). Нажатие на неё не раскрывает строку. */
  handle?: ReactNode;
  /** Справа от заголовка перед шевроном: счётчик, подпись. */
  summary?: ReactNode;
  isExpanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  children: ReactNode;
  className?: string;
};

/** Раскрывающаяся строка с рамкой (роли, группы настроек). Поведение и aria-expanded — react-aria. */
export function Disclosure({
  title,
  leading,
  handle,
  summary,
  isExpanded,
  defaultExpanded,
  onExpandedChange,
  children,
  className,
}: DisclosureProps) {
  return (
    <AriaDisclosure
      isExpanded={isExpanded}
      defaultExpanded={defaultExpanded}
      onExpandedChange={onExpandedChange}
      className={cx("group border border-line bg-surface", className)}
    >
      <div className="flex items-stretch">
        {handle}
        <Heading className="m-0 min-w-0 flex-1">
          <Button
            slot="trigger"
            className={cx(
              "ds-focus flex w-full cursor-pointer items-center gap-2.5 py-2.5 pr-3 text-left text-sm outline-none data-[hovered]:bg-elevated",
              handle ? "pl-1" : "pl-3",
            )}
          >
            {leading}
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{title}</span>
            {summary ? <span className="shrink-0 text-xs text-muted">{summary}</span> : null}
            <Icon name="chevron-down" size="sm" className="text-muted transition-transform group-data-[expanded]:rotate-180" />
          </Button>
        </Heading>
      </div>
      <DisclosurePanel>
        <div className="border-t border-line px-3 pb-3 pt-3">{children}</div>
      </DisclosurePanel>
    </AriaDisclosure>
  );
}

export type DragHandleProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement>;
  /** Подпись для скринридера. */
  label: string;
  isDisabled?: boolean;
};

/** Ручка перетаскивания для сортируемых строк (dnd-kit: `setActivatorNodeRef` + `listeners` + `attributes`). */
export function DragHandle({ ref, label, isDisabled = false, className, ...rest }: DragHandleProps) {
  return (
    <span
      ref={ref}
      aria-label={label}
      aria-disabled={isDisabled || undefined}
      {...(isDisabled ? {} : rest)}
      className={cx(
        "ds-focus flex w-7 shrink-0 touch-none items-center justify-center text-muted outline-none",
        isDisabled ? "cursor-not-allowed opacity-30" : "cursor-grab hover:bg-elevated hover:text-fg active:cursor-grabbing",
        className,
      )}
    >
      <Icon name="grip" size="sm" />
    </span>
  );
}

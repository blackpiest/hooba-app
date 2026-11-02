import { useRef, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseOnOutsideContextMenu } from "@/shared/ui/popover/CloseOnOutsideContextMenu";
import {
  Header,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger,
  Popover as AriaPopover,
  Separator,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  type PopoverProps as AriaPopoverProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon, type IconName } from "@/shared/ui/icon";
import { POPOVER_SURFACE, SHEET_ON_MOBILE } from "@/shared/ui/popover";

/* ---------- Пункт ---------- */

export type MenuItemProps = Omit<AriaMenuItemProps, "className" | "style" | "children"> & {
  children: ReactNode;
  icon?: IconName;
  /** Подсказка клавиш справа (текстом, например «R»). */
  shortcut?: string;
  /** Опасное действие (выгнать, удалить): красный цвет. */
  danger?: boolean;
};

export function MenuItem({ children, icon, shortcut, danger, ...props }: MenuItemProps) {
  return (
    <AriaMenuItem
      {...props}
      textValue={props.textValue ?? (typeof children === "string" ? children : undefined)}
      className={cx(
        "group flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-[9px] text-left text-[13px] outline-none max-md:min-h-12 max-md:gap-3 max-md:px-4 max-md:text-[15px]",
        danger
          ? "text-danger data-[hovered]:bg-danger/15 data-[focus-visible]:bg-danger/15"
          : "text-fg data-[hovered]:bg-brand-soft data-[focus-visible]:bg-brand-soft",
        "data-[disabled]:cursor-not-allowed data-[disabled]:text-disabled-text",
      )}
    >
      {({ isSelected, selectionMode }) => (
        <>
          {icon ? (
            <Icon
              name={icon}
              size="sm"
              className={cx(
                danger
                  ? "text-danger"
                  : "text-muted group-data-[hovered]:text-brand-text group-data-[focus-visible]:text-brand-text",
              )}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{children}</span>
          {shortcut ? <span className="font-label text-[10px] text-muted">{shortcut}</span> : null}
          {selectionMode !== "none" && isSelected ? <span aria-hidden="true" className="size-2 bg-brand-text" /> : null}
        </>
      )}
    </AriaMenuItem>
  );
}

/* ---------- Раздел и разделитель ---------- */

/** Группа пунктов с заголовком: `<MenuSection label="Статус">…</MenuSection>`. */
export function MenuSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <AriaMenuSection>
      {label ? (
        <Header className="px-2.5 pb-1.5 pt-2 font-label text-[9px] uppercase tracking-[0.12em] text-muted">{label}</Header>
      ) : null}
      {children}
    </AriaMenuSection>
  );
}

export function MenuSeparator() {
  return <Separator className="mx-0.5 my-1 h-px bg-line" />;
}

/* ---------- Список ---------- */

export type MenuProps<T extends object> = Omit<AriaMenuProps<T>, "className" | "style"> & { className?: string };

/** Список пунктов. Самостоятельно не всплывает — используйте DropdownMenu или ContextMenu. */
export function Menu<T extends object>({ className, ...props }: MenuProps<T>) {
  return <AriaMenu {...props} className={cx("max-h-[min(70vh,480px)] min-w-[220px] overflow-auto p-1 outline-none max-md:max-h-none", className)} />;
}

/* ---------- Выпадающее меню кнопки ---------- */

export type DropdownMenuProps<T extends object> = Omit<MenuProps<T>, "children"> & {
  /** Кнопка, открывающая меню. */
  trigger: ReactElement;
  placement?: AriaPopoverProps["placement"];
  /** Меню открылось или закрылось (например, спрятать подсказку у той же кнопки). */
  onOpenChange?: (isOpen: boolean) => void;
  children: ReactNode;
};

/**
 * Меню по нажатию на кнопку: стрелки, Enter, поиск по первой букве, Esc — react-aria.
 * `<DropdownMenu trigger={<Button>Статус</Button>} onAction={…}><MenuItem id="x">…</MenuItem></DropdownMenu>`
 */
export function DropdownMenu<T extends object>({
  trigger,
  placement = "bottom start",
  onOpenChange,
  children,
  ...menuProps
}: DropdownMenuProps<T>) {
  return (
    <MenuTrigger onOpenChange={onOpenChange}>
      {trigger}
      {/* flex-col + min-h-0: список ужимается под высоту, которую react-aria оставил поповеру, и не вылезает за рамку. */}
      <AriaPopover placement={placement} offset={6} className={cx(POPOVER_SURFACE, SHEET_ON_MOBILE, "flex flex-col")}>
        <CloseOnOutsideContextMenu />
        <Menu {...menuProps} className={cx("min-h-0", menuProps.className)}>
          {children}
        </Menu>
      </AriaPopover>
    </MenuTrigger>
  );
}

/* ---------- Контекстное меню в точке экрана ---------- */

export type ContextMenuProps<T extends object> = Omit<MenuProps<T>, "children"> & {
  /** Координаты клика (clientX / clientY). */
  x: number;
  y: number;
  onClose: () => void;
  /** Произвольное содержимое над списком пунктов (ползунок громкости). Не часть списка меню. */
  header?: ReactNode;
  /** Закрывать меню после выбора пункта. `false` — закрывает сам вызывающий (например, после ответа сервера). */
  closeOnAction?: boolean;
  children: ReactNode;
};

/**
 * Меню по правому клику. Родитель хранит `{x, y} | null` и рендерит компонент, пока меню открыто;
 * закрытие — Esc, клик снаружи, выбор пункта или прокрутка.
 */
export function ContextMenu<T extends object>({ x, y, onClose, header, closeOnAction = true, children, ...menuProps }: ContextMenuProps<T>) {
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <>
      {/* В body: у предка с transform / backdrop-filter «fixed» считается от него, а не от окна, и меню уезжало от курсора. */}
      {createPortal(
        <div ref={anchor} aria-hidden="true" className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />,
        document.body,
      )}
      <AriaPopover
        isOpen
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        triggerRef={anchor}
        placement="bottom start"
        offset={0}
        shouldFlip
        className={cx(POPOVER_SURFACE, SHEET_ON_MOBILE, "flex flex-col")}
      >
        <CloseOnOutsideContextMenu />
        {header ? <div className="shrink-0 border-b border-line p-3 max-md:px-4">{header}</div> : null}
        <Menu
          {...menuProps}
          className={cx("min-h-0", menuProps.className)}
          // Фокус на сам список, не на первый пункт: иначе он сразу подсвечен как при наведении.
          autoFocus
          onAction={(key) => {
            menuProps.onAction?.(key);
            if (closeOnAction) {
              onClose();
            }
          }}
        >
          {children}
        </Menu>
      </AriaPopover>
    </>
  );
}

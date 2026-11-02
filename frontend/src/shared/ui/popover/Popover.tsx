import type { ReactElement, ReactNode, RefObject } from "react";
import {
  Dialog,
  DialogTrigger,
  OverlayArrow,
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";
import { CloseOnOutsideContextMenu } from "./CloseOnOutsideContextMenu";

/** Классы поверхности всплывающих панелей (меню, поповер, выпадающий список). */
export const POPOVER_SURFACE = "ds-drop z-[100] border border-line-strong bg-elevated shadow-pop outline-none";

/**
 * Поверх POPOVER_SURFACE: на мобильной ширине панель — нижняя шторка во всю ширину, а не плашка у точки нажатия.
 * `!` перебивает инлайн-позицию react-aria; тень на весь экран — затемнение фона (клик по нему закрывает, как и раньше).
 */
export const SHEET_ON_MOBILE =
  "max-md:fixed! max-md:inset-x-0! max-md:top-auto! max-md:bottom-0! max-md:w-auto! max-md:max-w-none! max-md:max-h-[85dvh]! " +
  "max-md:border-x-0 max-md:border-b-0 max-md:pb-safe max-md:shadow-[0_0_0_100vmax_rgb(0_0_0/0.6)]";

export type PopoverProps = {
  /** Элемент, по нажатию на который открывается панель: Button, IconButton и т.п. */
  trigger: ReactElement;
  /** Имя панели для скринридера. */
  "aria-label": string;
  placement?: AriaPopoverProps["placement"];
  /** Функция получает `close` — закрыть панель после действия внутри неё. */
  children: ReactNode | ((opts: { close: () => void }) => ReactNode);
  /** Только для внешней раскладки (ширина, отступы). */
  className?: string;
  /** На мобильной ширине — нижняя шторка во всю ширину (большие панели: выбор эмодзи). */
  mobileSheet?: boolean;
};

/**
 * Панель с произвольным содержимым рядом с элементом-триггером (карточка профиля, пояснение, мини-форма).
 * Закрывается по Esc и клику снаружи, фокус внутри панели — react-aria.
 */
export function Popover({ trigger, children, placement = "bottom start", className, mobileSheet, ...aria }: PopoverProps) {
  return (
    <DialogTrigger>
      {trigger}
      <AriaPopover placement={placement} offset={8} className={cx(POPOVER_SURFACE, mobileSheet && SHEET_ON_MOBILE)}>
        <CloseOnOutsideContextMenu />
        <Dialog {...aria} className={cx("min-w-[220px] max-w-[320px] p-4 text-[12px] leading-relaxed text-muted outline-none", mobileSheet && "max-md:max-w-none", className)}>
          {children}
        </Dialog>
      </AriaPopover>
    </DialogTrigger>
  );
}

/** Заголовок внутри поповера. */
export function PopoverTitle({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 font-heading text-[13px] tracking-tight text-fg">{children}</p>;
}

export type AnchoredPopoverProps = {
  /** Элемент, к которому крепится панель (сама панель его не открывает). */
  triggerRef: RefObject<Element | null>;
  isOpen: boolean;
  /** Esc внутри панели. */
  onClose: () => void;
  "aria-label": string;
  placement?: AriaPopoverProps["placement"];
  children: ReactNode;
  /** Только для внешней раскладки (ширина, отступы). */
  className?: string;
};

/**
 * Подсказка со стрелкой у элемента, которую открывает приложение, а не нажатие (новинки, онбординг).
 * Немодальная: не забирает фокус и не закрывается от кликов по остальному интерфейсу — только своими кнопками или Esc.
 */
export function AnchoredPopover({ triggerRef, isOpen, onClose, children, placement = "top start", className, ...aria }: AnchoredPopoverProps) {
  return (
    <AriaPopover
      triggerRef={triggerRef}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isNonModal
      placement={placement}
      offset={12}
      className={cx(POPOVER_SURFACE, "overflow-visible")}
    >
      {/* Стрелка заходит на рамку на 1px, чтобы линия рамки не перечёркивала основание. */}
      <OverlayArrow className="group data-[placement=bottom]:-mb-px data-[placement=top]:-mt-px">
        <svg
          width={12}
          height={12}
          viewBox="0 0 12 12"
          aria-hidden="true"
          className="block fill-elevated stroke-line-strong group-data-[placement=bottom]:rotate-180 group-data-[placement=left]:-rotate-90 group-data-[placement=right]:rotate-90"
        >
          <path d="M0 0 L6 6 L12 0" />
        </svg>
      </OverlayArrow>
      <div
        role="dialog"
        {...aria}
        className={cx("min-w-[220px] max-w-[300px] p-4 text-[12px] leading-relaxed text-muted outline-none", className)}
      >
        {children}
      </div>
    </AriaPopover>
  );
}

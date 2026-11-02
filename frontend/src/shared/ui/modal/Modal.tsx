import type { ReactNode } from "react";
import { Dialog, Heading, Modal as AriaModal, ModalOverlay } from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon, type IconName } from "@/shared/ui/icon";
import { IconButton } from "@/shared/ui/button";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

const SIZE: Record<ModalSize, string> = {
  sm: "max-w-[420px]",
  md: "max-w-[490px]",
  lg: "max-w-[640px]",
  xl: "max-w-[800px]",
  "2xl": "max-w-5xl",
};

/**
 * Мобильная ширина: маленькое окно — нижняя шторка, остальные — на весь экран (без рамки, с учётом выреза и «домой»).
 * Только `max-md:` — десктопная раскладка не меняется.
 */
const MOBILE_SHEET = "max-md:mt-auto max-md:max-h-[90dvh] max-md:border-x-0 max-md:border-b-0 max-md:pb-safe";
const MOBILE_FULL =
  "max-md:h-full max-md:max-h-none max-md:max-w-none max-md:border-0 max-md:pt-safe max-md:pb-safe max-md:px-safe";

export type ModalProps = {
  isOpen: boolean;
  /** Вызывается по крестику, Esc и клику на подложку. */
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  /** Иконка-символ над заголовком (по умолчанию нет). */
  icon?: IconName;
  size?: ModalSize;
  /** `danger` — красная рамка и символ, для опасных действий. */
  tone?: "default" | "danger";
  /** Нижняя панель с кнопками действий. */
  footer?: ReactNode;
  /** `alertdialog` — для подтверждений: скринридер читает заголовок и текст сразу. */
  role?: "dialog" | "alertdialog";
  /** Нельзя закрыть кликом по подложке / Esc (например, во время сохранения). */
  isDismissable?: boolean;
  /** Скрыть крестик (нужен `footer` с «Отмена»). */
  hideClose?: boolean;
  children?: ReactNode;
  /** Только для внешней раскладки тела. */
  bodyClassName?: string;
  /**
   * `bare` — только рамка окна, без шапки и подвала: содержимое рисует вызывающий (окно настроек с боковым меню).
   * `title` тогда служит именем окна для скринридера; в содержимом нужен свой `Heading slot="title"` или кнопка закрытия.
   */
  bare?: boolean;
  /** Окно постоянной высоты (а не по содержимому): переключение вкладок и фильтров внутри не меняет его размер. */
  fixedHeight?: boolean;
};

/**
 * Модальное окно дизайн-системы. Поведение — react-aria: фокус-ловушка, Esc, блокировка прокрутки,
 * возврат фокуса на кнопку-триггер. Состояние держит вызывающий: `isOpen` + `onClose`.
 * Заголовок не скроллится, прокручивается только тело.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = "md",
  tone = "default",
  footer,
  role = "dialog",
  isDismissable = true,
  hideClose = false,
  children,
  bodyClassName,
  bare = false,
  fixedHeight = false,
}: ModalProps) {
  const danger = tone === "danger";
  const sheet = size === "sm";
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={!isDismissable}
      className={cx(
        "ds-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-2 sm:p-4 max-md:p-0",
        sheet && "max-md:items-end",
      )}
    >
      <AriaModal className={cx("ds-pop w-full outline-none", !sheet && "max-md:h-full")}>
        <Dialog
          role={role}
          aria-label={bare ? title : undefined}
          className={cx(
            "relative mx-auto flex max-h-[min(92dvh,720px)] w-full sm:max-h-[min(86vh,720px)] flex-col border bg-bg text-fg shadow-pop outline-none",
            danger ? "border-danger" : "border-brand/60",
            SIZE[size],
            fixedHeight && "h-[min(86vh,720px)]",
            sheet ? MOBILE_SHEET : MOBILE_FULL,
          )}
        >
          {bare ? (
            children
          ) : (
            <>
          <div className="flex shrink-0 items-start justify-between gap-4 px-8 pt-8 max-md:px-5 max-md:pt-5">
            <div className="min-w-0">
              {icon ? (
                <Icon name={icon} className={cx("mb-4 size-[38px]", danger ? "text-danger" : "text-brand")} />
              ) : null}
              <Heading slot="title" className="font-heading text-[21px] leading-snug tracking-tight">
                {title}
              </Heading>
              {subtitle ? <p className="mt-2 text-[13px] leading-relaxed text-muted">{subtitle}</p> : null}
            </div>
            {hideClose ? null : (
              <IconButton
                icon="close"
                label="Закрыть"
                size="sm"
                onPress={onClose}
                isDisabled={!isDismissable}
                className="-mr-3 -mt-3"
              />
            )}
          </div>

          <div className={cx("min-h-0 flex-1 overflow-y-auto px-8 py-5 text-[13px] leading-relaxed text-muted max-md:px-5 max-md:text-[14px]", bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-line px-8 py-5 max-md:px-5 max-md:py-4 max-md:*:grow">{footer}</div>
          ) : (
            <div className="h-3 shrink-0" />
          )}
            </>
          )}
        </Dialog>
      </AriaModal>
    </ModalOverlay>
  );
}

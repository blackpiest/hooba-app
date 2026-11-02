import { forwardRef, type ReactNode, type Ref } from "react";
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon, type IconName } from "@/shared/ui/icon";
import { useEditContextMenu } from "./edit-context-menu";
import { ADDON, ERROR, HINT, INPUT_BASE, LABEL, SUCCESS } from "./field-styles";

export type TextFieldProps = Omit<AriaTextFieldProps, "className" | "style" | "children"> & {
  label?: ReactNode;
  /** Пояснение под полем. */
  hint?: ReactNode;
  /** Текст ошибки: включает состояние invalid. Без него показывается сообщение нативной валидации. */
  error?: ReactNode;
  /** Текст успеха (зелёная рамка). */
  success?: ReactNode;
  placeholder?: string;
  /** Справа в строке подписи: счётчик символов («12/32»). Скрыт от скринридера. */
  labelAside?: ReactNode;
  /** Иконка внутри поля слева. */
  leadingIcon?: IconName;
  /** Элемент справа внутри поля (например, кнопка «показать пароль»). Высота — до 34px. */
  trailing?: ReactNode;
  /** Префикс / суффикс снаружи поля, например «https://» (InputGroup). */
  addonStart?: ReactNode;
  addonEnd?: ReactNode;
  /** Элемент `trailing` шире 34px (текстовая кнопка): под него резервируется место справа. */
  trailingWide?: boolean;
  /** Ref на строку поля (аддоны + ввод, без подписи и подсказки): якорь для выпадающих списков. */
  fieldRef?: Ref<HTMLDivElement>;
  /** Моноширинный шрифт значения (коды приглашений, адреса). */
  mono?: boolean;
  /** Только для внешней раскладки. */
  className?: string;
};

/**
 * Текстовое поле дизайн-системы. Поведение и доступность — react-aria `TextField`.
 * Валидация нативная (`isRequired`, `minLength`, `validate`) — сообщение появится под полем при отправке формы.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    hint,
    error,
    success,
    placeholder,
    labelAside,
    leadingIcon,
    trailing,
    addonStart,
    addonEnd,
    trailingWide,
    fieldRef,
    mono,
    className,
    isInvalid,
    isRequired,
    ...props
  },
  ref,
) {
  const hasError = error != null && error !== false;
  const edit = useEditContextMenu();
  return (
    <>
    <AriaTextField
      {...props}
      isRequired={isRequired}
      isInvalid={hasError ? true : isInvalid}
      className={cx("group flex min-w-0 flex-col gap-2 text-left", className)}
    >
      {label ? (
        <Label className={LABEL}>
          <span>
            {label}
            {isRequired ? <em className="ml-1 not-italic text-accent">*</em> : null}
          </span>
          {labelAside ? <span aria-hidden="true">{labelAside}</span> : null}
        </Label>
      ) : null}

      <div ref={fieldRef} className="flex min-w-0">
        {addonStart ? <span className={cx(ADDON, "border-r-0")}>{addonStart}</span> : null}
        <div className="relative flex min-w-0 flex-1">
          {leadingIcon ? (
            <Icon
              name={leadingIcon}
              size="sm"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
          ) : null}
          <Input
            ref={ref}
            placeholder={placeholder}
            onContextMenu={edit.onContextMenu}
            className={cx(
              INPUT_BASE,
              "h-11",
              mono && "font-label text-xs",
              leadingIcon && "pl-[38px]",
              trailing && (trailingWide ? "pr-[104px]" : "pr-11"),
              success && !hasError && "border-success",
            )}
          />
          {trailing ? <div className="absolute right-[5px] top-[5px]">{trailing}</div> : null}
        </div>
        {addonEnd ? <span className={cx(ADDON, "border-l-0")}>{addonEnd}</span> : null}
      </div>

      {hint && !hasError ? (
        <Text slot="description" className={HINT}>
          {hint}
        </Text>
      ) : null}
      {success && !hasError ? <p className={SUCCESS}>{success}</p> : null}
      <FieldError className={ERROR}>{hasError ? error : undefined}</FieldError>
    </AriaTextField>
    {edit.menu}
    </>
  );
});

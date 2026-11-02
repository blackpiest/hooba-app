import { forwardRef, type ReactNode } from "react";
import {
  Button,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
  type SelectProps as AriaSelectProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";
import { CloseOnOutsideContextMenu } from "@/shared/ui/popover/CloseOnOutsideContextMenu";
import { Icon } from "@/shared/ui/icon";
import { ERROR, HINT, INPUT_BASE, LABEL } from "@/shared/ui/text-field/field-styles";

export type SelectOption = {
  value: string;
  label: ReactNode;
  /** Мелкая подпись справа или под названием (например, «USB»). */
  description?: ReactNode;
  isDisabled?: boolean;
};

export type SelectProps = Omit<
  AriaSelectProps<SelectOption>,
  "className" | "style" | "children" | "items" | "selectedKey" | "defaultSelectedKey" | "onSelectionChange" | "value" | "onChange"
> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: readonly SelectOption[];
  /** Выбранное значение (`null` — ничего не выбрано, показывается placeholder). */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  /** Только для внешней раскладки. */
  className?: string;
};

/**
 * Выпадающий список дизайн-системы. Поведение — react-aria `Select` (клавиатура, поиск по первым буквам,
 * форма через скрытый select). Список — по `options`.
 */
export const Select = forwardRef<HTMLDivElement, SelectProps>(function Select(
  { label, hint, error, options, value, defaultValue, onChange, className, isInvalid, isRequired, placeholder, ...props },
  ref,
) {
  const hasError = error != null && error !== false;
  return (
    <AriaSelect
      ref={ref}
      {...props}
      placeholder={placeholder ?? "Выберите…"}
      isRequired={isRequired}
      isInvalid={hasError ? true : isInvalid}
      selectedKey={value}
      defaultSelectedKey={defaultValue}
      onSelectionChange={(key) => {
        if (key != null) {
          onChange?.(String(key));
        }
      }}
      className={cx("group flex min-w-0 flex-col gap-2 text-left", className)}
    >
      {label ? (
        <Label className={LABEL}>
          <span>
            {label}
            {isRequired ? <em className="ml-1 not-italic text-accent">*</em> : null}
          </span>
        </Label>
      ) : null}

      <Button
        className={cx(
          INPUT_BASE,
          "flex h-11 cursor-pointer items-center justify-between gap-2 text-left",
          "data-[pressed]:border-brand group-data-[open]:border-brand group-data-[open]:shadow-soft",
          "group-data-[invalid]:border-danger",
          "data-[focus-visible]:[outline:var(--ds-focus-ring)] data-[focus-visible]:outline-offset-[3px]",
        )}
      >
        <SelectValue<SelectOption> className="min-w-0 flex-1 truncate data-[placeholder]:text-disabled-text">
          {({ selectedItem, isPlaceholder, defaultChildren }) => (isPlaceholder ? defaultChildren : selectedItem?.label)}
        </SelectValue>
        <Icon
          name="chevron-down"
          size="sm"
          className="text-muted transition-transform group-data-[open]:rotate-180 group-data-[disabled]:text-disabled-line"
        />
      </Button>

      {hint && !hasError ? (
        <Text slot="description" className={HINT}>
          {hint}
        </Text>
      ) : null}
      <FieldError className={ERROR}>{hasError ? error : undefined}</FieldError>

      <Popover
        offset={4}
        className="z-50 max-h-60 min-w-(--trigger-width) overflow-auto border border-line-strong bg-elevated p-1 shadow-pop"
      >
        <CloseOnOutsideContextMenu />
        <ListBox items={options} className="outline-none">
          {(option) => (
            <ListBoxItem
              id={option.value}
              textValue={typeof option.label === "string" ? option.label : option.value}
              isDisabled={option.isDisabled}
              className={cx(
                "flex cursor-pointer items-center justify-between gap-3 px-2.5 py-2 text-[13px] text-muted outline-none",
                "data-[focused]:bg-brand-soft data-[focused]:text-fg",
                "data-[selected]:text-fg",
                "data-[disabled]:cursor-not-allowed data-[disabled]:text-disabled-text",
              )}
            >
              {({ isSelected }) => (
                <>
                  <Text slot="label" className="min-w-0 flex-1 truncate">
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text slot="description" className="shrink-0 font-label text-[10px] text-muted">
                      {option.description}
                    </Text>
                  ) : null}
                  {isSelected ? <Icon name="check" size="sm" strokeWidth={2.5} className="text-brand-text" /> : null}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
});

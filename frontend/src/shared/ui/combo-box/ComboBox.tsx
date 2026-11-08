import { useContext, useEffect, useRef, useState, type ContextType, type ReactNode, type RefObject } from "react";
import {
  Button,
  ComboBox as AriaComboBox,
  ComboBoxStateContext,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from "react-aria-components";
import { cx } from "@/utils/cx";
import { CloseOnOutsideContextMenu } from "@/shared/ui/popover/CloseOnOutsideContextMenu";
import { Icon } from "@/shared/ui/icon";
import { ERROR, HINT, INPUT_BASE, LABEL } from "@/shared/ui/text-field/field-styles";

export type ComboBoxOption = {
  value: string;
  label: string;
};

export type ComboBoxProps = {
  label?: ReactNode;
  "aria-label"?: string;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  options: readonly ComboBoxOption[];
  /** Вызывается при выборе пункта; после этого поле очищается: выбранное хранит и показывает вызывающий. */
  onSelect: (value: string) => void;
  emptyText?: string;
  isDisabled?: boolean;
  /** Только для внешней раскладки. */
  className?: string;
};

type ComboBoxState = ContextType<typeof ComboBoxStateContext>;

/** Нажатие на поле открывает весь список, как у `Select`. Ввод react-aria открывает список сам. */
function SearchInput({ stateRef, placeholder }: { stateRef: RefObject<ComboBoxState>; placeholder?: string }) {
  const state = useContext(ComboBoxStateContext);
  useEffect(() => {
    stateRef.current = state;
  });
  return (
    <Input
      placeholder={placeholder}
      className={cx(INPUT_BASE, "h-11 pr-10")}
      onClick={() => {
        if (state && !state.isOpen) {
          state.open(null, "manual");
        }
      }}
    />
  );
}

/**
 * Поиск по длинному списку с добавлением в набор. Ввод фильтрует пункты по подстроке без учёта регистра,
 * свой текст не принимается: при уходе с поля он стирается. Одно значение из короткого списка — `Select`.
 */
export function ComboBox({
  label,
  "aria-label": ariaLabel,
  hint,
  error,
  placeholder,
  options,
  onSelect,
  emptyText = "Ничего не найдено",
  isDisabled,
  className,
}: ComboBoxProps) {
  const [query, setQuery] = useState("");
  const stateRef = useRef<ComboBoxState>(null);
  const hasError = error != null && error !== false;
  return (
    <AriaComboBox
      aria-label={ariaLabel}
      defaultItems={options}
      selectedKey={null}
      inputValue={query}
      allowsEmptyCollection
      isDisabled={isDisabled}
      isInvalid={hasError}
      onInputChange={setQuery}
      onBlur={() => setQuery("")}
      onSelectionChange={(key) => {
        if (key != null) {
          onSelect(String(key));
          setQuery("");
          // react-aria открывает список при любой смене текста, в том числе при этой очистке,
          // а он закрыл бы то, что показано под полем.
          requestAnimationFrame(() => stateRef.current?.close());
        }
      }}
      className={cx("group flex min-w-0 flex-col gap-2 text-left", className)}
    >
      {label ? <Label className={LABEL}>{label}</Label> : null}

      <div className="relative">
        <SearchInput stateRef={stateRef} placeholder={placeholder} />
        <Button
          aria-label="Показать список"
          className="absolute inset-y-0 right-0 grid w-10 cursor-pointer place-items-center text-muted outline-none data-[focus-visible]:[outline:var(--ds-focus-ring)] data-[disabled]:cursor-not-allowed"
        >
          <Icon
            name="chevron-down"
            size="sm"
            className="transition-transform group-data-[open]:rotate-180 group-data-[disabled]:text-disabled-line"
          />
        </Button>
      </div>

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
        <ListBox<ComboBoxOption>
          className="outline-none"
          renderEmptyState={() => <p className="px-2.5 py-2 text-[13px] text-muted">{emptyText}</p>}
        >
          {(option) => (
            <ListBoxItem
              id={option.value}
              textValue={option.label}
              className={cx(
                "cursor-pointer truncate px-2.5 py-2 text-[13px] text-muted outline-none",
                "data-[focused]:bg-brand-soft data-[focused]:text-fg",
              )}
            >
              {option.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
}

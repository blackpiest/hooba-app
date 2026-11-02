import { forwardRef, type ReactNode } from "react";
import {
  FieldError,
  Label,
  Text,
  TextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";
import { useEditContextMenu } from "./edit-context-menu";
import { ERROR, HINT, INPUT_BASE, LABEL } from "./field-styles";

export type TextareaProps = Omit<AriaTextFieldProps, "className" | "style" | "children"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  rows?: number;
  /** Показывать счётчик «n / maxLength» (нужны управляемый value и maxLength). */
  showCount?: boolean;
  className?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, placeholder, rows = 4, showCount, className, isInvalid, isRequired, ...props },
  ref,
) {
  const hasError = error != null && error !== false;
  const edit = useEditContextMenu();
  const count =
    showCount && typeof props.value === "string" && props.maxLength ? `${props.value.length} / ${props.maxLength}` : null;
  return (
    <>
    <AriaTextField
      {...props}
      isRequired={isRequired}
      isInvalid={hasError ? true : isInvalid}
      className={cx("group flex min-w-0 flex-col gap-2 text-left", className)}
    >
      {label || count ? (
        <Label className={LABEL}>
          <span>
            {label}
            {isRequired ? <em className="ml-1 not-italic text-accent">*</em> : null}
          </span>
          {count ? <span aria-hidden="true">{count}</span> : null}
        </Label>
      ) : null}
      <TextArea
        ref={ref}
        rows={rows}
        placeholder={placeholder}
        onContextMenu={edit.onContextMenu}
        className={cx(INPUT_BASE, "min-h-[92px] resize-y py-[11px] leading-relaxed data-[disabled]:resize-none")}
      />
      {hint && !hasError ? (
        <Text slot="description" className={HINT}>
          {hint}
        </Text>
      ) : null}
      <FieldError className={ERROR}>{hasError ? error : undefined}</FieldError>
    </AriaTextField>
    {edit.menu}
    </>
  );
});

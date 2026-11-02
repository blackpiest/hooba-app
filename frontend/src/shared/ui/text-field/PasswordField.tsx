import { forwardRef, useState } from "react";
import { IconButton } from "@/shared/ui/button";
import { TextField, type TextFieldProps } from "./TextField";

export type PasswordFieldProps = Omit<TextFieldProps, "type" | "trailing">;

/** Поле пароля с кнопкой «показать / скрыть». */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      ref={ref}
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <IconButton
          icon={visible ? "eye-off" : "eye"}
          label={visible ? "Скрыть пароль" : "Показать пароль"}
          onPress={() => setVisible((v) => !v)}
          isDisabled={props.isDisabled}
          excludeFromTabOrder
        />
      }
    />
  );
});

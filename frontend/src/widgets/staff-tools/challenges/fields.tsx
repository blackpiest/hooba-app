import { useState } from "react";
import { formatLocalHour, parseLocalHour } from "@/features/challenges/condition-text";
import type { LocalHour } from "@/shared/api/challenges";
import { TextField } from "@/shared/ui";

/**
 * Дата и час по часам сообщества: «31.10.2026 20:00» (с `anyMinute` — любые минуты). Значение
 * коммитится при уходе с поля; неверный ввод подсвечивается и не сбрасывает прежнее значение.
 */
export function LocalHourField({
  label,
  value,
  onChange,
  isRequired,
  isDisabled,
  anyMinute = false,
}: {
  label: string;
  value: LocalHour | null | undefined;
  onChange: (value: LocalHour | null) => void;
  isRequired?: boolean;
  isDisabled?: boolean;
  anyMinute?: boolean;
}) {
  const [text, setText] = useState(value ? formatLocalHour(value) : "");
  const [error, setError] = useState<string | null>(null);
  return (
    <TextField
      label={label}
      value={text}
      placeholder={anyMinute ? "31.10.2026 20:15" : "31.10.2026 20:00"}
      isDisabled={isDisabled}
      error={error}
      onChange={(next) => {
        setText(next);
        setError(null);
      }}
      onBlur={() => {
        const parsed = parseLocalHour(text, { anyMinute });
        if (parsed === "invalid") {
          setError(anyMinute ? "Формат: ДД.ММ.ГГГГ ЧЧ:ММ" : "Формат: ДД.ММ.ГГГГ ЧЧ:00 — только целые часы");
          return;
        }
        if (parsed === null && isRequired) {
          setError("Нужна дата");
          return;
        }
        onChange(parsed);
      }}
    />
  );
}

/** Целое число в пределах `min…max`; вне пределов — ошибка, прежнее значение сохраняется. */
export function AmountField({
  label,
  value,
  onChange,
  min = 1,
  max,
  suffix,
  isDisabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  suffix?: string;
  isDisabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  return (
    <TextField
      label={label}
      value={text}
      inputMode="numeric"
      isDisabled={isDisabled}
      error={error}
      labelAside={suffix}
      onChange={(next) => {
        setText(next);
        const n = Number(next);
        if (Number.isInteger(n) && n >= min && n <= max) {
          setError(null);
          onChange(n);
        } else {
          setError(`Целое от ${min} до ${max}`);
        }
      }}
    />
  );
}

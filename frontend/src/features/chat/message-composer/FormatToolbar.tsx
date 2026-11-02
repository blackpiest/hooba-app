import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isFormatActive, type FormatKind } from "@/features/chat/message-content";
import { IconButton, Toolbar, Tooltip, type IconName } from "@/shared/ui";

const FORMATS: { kind: FormatKind; label: string; shortcut: string; keys: string; icon: IconName }[] = [
  { kind: "bold", label: "Полужирный", shortcut: "Ctrl+B", keys: "Control+B", icon: "bold" },
  { kind: "italic", label: "Наклонный", shortcut: "Ctrl+I", keys: "Control+I", icon: "italic" },
  { kind: "strike", label: "Зачёркнутый", shortcut: "Ctrl+Shift+S", keys: "Control+Shift+S", icon: "strike" },
  { kind: "underline", label: "Подчёркнутый", shortcut: "Ctrl+U", keys: "Control+U", icon: "underline" },
  { kind: "code", label: "Моноширинный", shortcut: "Ctrl+Shift+M", keys: "Control+Shift+M", icon: "code" },
];

/** Плавающая панель форматирования у выделенного текста в поле ввода. */
export function FormatToolbar({
  x,
  y,
  value,
  start,
  end,
  onToggle,
}: {
  x: number;
  y: number;
  value: string;
  start: number;
  end: number;
  onToggle: (kind: FormatKind) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: Math.max(8, y - 40) });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - rect.width / 2), window.innerWidth - rect.width - 8);
    let top = y - rect.height - 8;
    if (top < 8) {
      top = y + 22;
    }
    setPos({ left, top });
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 border border-line-strong bg-elevated p-1 shadow-pop"
      style={{ left: pos.left, top: pos.top }}
      // Нажатие по панели не должно снимать выделение и фокус с поля ввода
      // (у кнопок фокус держит preventFocusOnPress: иначе blur поля прячет панель до onPress).
      onMouseDown={(event) => event.preventDefault()}
    >
      <Toolbar aria-label="Форматирование" className="border-0 bg-transparent p-0">
        {FORMATS.map((item) => (
          <Tooltip key={item.kind} content={`${item.label} (${item.shortcut})`}>
            <IconButton
              icon={item.icon}
              label={item.label}
              size="sm"
              pressed={isFormatActive(value, start, end, item.kind)}
              aria-keyshortcuts={item.keys}
              preventFocusOnPress
              onPress={() => onToggle(item.kind)}
            />
          </Tooltip>
        ))}
      </Toolbar>
    </div>,
    document.body,
  );
}

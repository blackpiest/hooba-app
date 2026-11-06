import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { peekClipboardText, readClipboardText, writeClipboardText } from "@/shared/lib/clipboard";
import { isTouchInput } from "@/hooks/use-breakpoint";
import { ContextMenu, MenuItem } from "@/shared/ui/menu";

type EditableElement = HTMLInputElement | HTMLTextAreaElement;

type MenuState = {
  x: number;
  y: number;
  element: EditableElement;
  start: number;
  end: number;
  canPaste: boolean;
};

/** Записывает значение «как с клавиатуры»: React и react-aria получают обычное событие input (работает и для неуправляемых полей). */
function setNativeValue(element: EditableElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Контекстное меню поля ввода: Вырезать / Копировать / Вставить, та же логика, что в поле чата.
 * Вырезать и копировать — только при выделении (и не в поле пароля); вставка недоступна при пустом буфере и в `readOnly`.
 * Использование: `onContextMenu` — на `<Input>`, `menu` — рядом с полем.
 */
export function useEditContextMenu(): {
  onContextMenu: (event: MouseEvent<EditableElement>) => void;
  menu: ReactNode;
} {
  const [state, setState] = useState<MenuState | null>(null);
  const requestRef = useRef(0);

  const close = useCallback(() => {
    requestRef.current += 1;
    setState(null);
  }, []);

  const onContextMenu = useCallback((event: MouseEvent<EditableElement>) => {
    const element = event.currentTarget;
    // Тач: системное меню выделения и вставки, своё не показываем.
    if (element.disabled || isTouchInput()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    const { clientX: x, clientY: y } = event;
    const request = ++requestRef.current;
    void (async () => {
      const clip = await peekClipboardText();
      if (request !== requestRef.current) {
        return;
      }
      setState({ x, y, element, start, end, canPaste: clip === null || clip.length > 0 });
    })();
  }, []);

  if (!state) {
    return { onContextMenu, menu: null };
  }

  const { element, start, end } = state;
  const hasSelection = start !== end;
  const isSecret = element instanceof HTMLInputElement && element.type === "password";
  const readOnly = element.readOnly;

  const place = (from: number, to: number) => {
    element.focus();
    element.setSelectionRange(from, to);
  };

  async function copy() {
    await writeClipboardText(element.value.slice(start, end));
    place(start, end);
  }

  async function cut() {
    const wrote = await writeClipboardText(element.value.slice(start, end));
    if (!wrote) {
      place(start, end);
      return;
    }
    const value = element.value;
    setNativeValue(element, value.slice(0, start) + value.slice(end));
    place(start, start);
  }

  async function paste() {
    const text = await readClipboardText();
    if (!text) {
      place(start, end);
      return;
    }
    const value = element.value;
    const room = element.maxLength >= 0 ? Math.max(0, element.maxLength - (value.length - (end - start))) : text.length;
    const insert = text.slice(0, room);
    setNativeValue(element, value.slice(0, start) + insert + value.slice(end));
    place(start + insert.length, start + insert.length);
  }

  const showCopy = hasSelection && !isSecret;
  const showCut = showCopy && !readOnly;

  return {
    onContextMenu,
    menu: (
      <ContextMenu
        x={state.x}
        y={state.y}
        onClose={close}
        aria-label="Редактирование текста"
        disabledKeys={state.canPaste && !readOnly ? [] : ["paste"]}
        onAction={(key) => {
          if (key === "cut") {
            void cut();
          } else if (key === "copy") {
            void copy();
          } else if (key === "paste") {
            void paste();
          }
        }}
      >
        {showCut ? (
          <MenuItem id="cut" icon="scissors">
            Вырезать
          </MenuItem>
        ) : null}
        {showCopy ? (
          <MenuItem id="copy" icon="copy">
            Копировать
          </MenuItem>
        ) : null}
        <MenuItem id="paste" icon="clipboard">
          Вставить
        </MenuItem>
      </ContextMenu>
    ),
  };
}

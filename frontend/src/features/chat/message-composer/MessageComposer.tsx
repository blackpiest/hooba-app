import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  canSendMessageDraft,
  canonicalMessageLength,
  formatKindFromShortcut,
  MESSAGE_CONTENT_COUNTER_FROM,
  MESSAGE_CONTENT_LIMIT,
  normalizeComposerText,
  toggleFormat,
  type FormatKind,
} from "@/features/chat/message-content";
import { peekClipboardText, readClipboardText, writeClipboardText } from "@/shared/lib/clipboard";
import { Composer, ComposerTextarea, ContextMenu, MenuItem } from "@/shared/ui";
import { cx } from "@/utils/cx";
import { EmojiPickerButton } from "./EmojiPicker";
import { FormatToolbar } from "./FormatToolbar";
import { isTouchInput } from "@/hooks/use-breakpoint";

const MAX_HEIGHT_PX = 192;
const MIRROR_PROPS = [
  "box-sizing",
  "width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-style",
  "font-weight",
  "font-size",
  "font-family",
  "line-height",
  "letter-spacing",
  "text-indent",
  "text-transform",
];

type MenuState = {
  x: number;
  y: number;
  start: number;
  end: number;
  canPaste: boolean;
};

type ToolbarState = {
  x: number;
  y: number;
  start: number;
  end: number;
};

function selectionAnchor(textarea: HTMLTextAreaElement): { x: number; y: number } | null {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  if (start === end) {
    return null;
  }
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";
  for (const prop of MIRROR_PROPS) {
    mirror.style.setProperty(prop, style.getPropertyValue(prop));
  }
  mirror.textContent = textarea.value.slice(0, start);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(start, end);
  mirror.append(marker);
  document.body.append(mirror);
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  mirror.remove();
  const rect = textarea.getBoundingClientRect();
  const y = rect.top + borderTop + top - textarea.scrollTop;
  const x = rect.left + borderLeft + left - textarea.scrollLeft;
  if (y < rect.top - 2 || y > rect.bottom + 2) {
    return null;
  }
  return { x, y };
}

export function MessageComposer({
  value,
  onValueChange,
  placeholder,
  onSubmit,
  onEscape,
  onPasteFiles,
  allowEmpty = false,
  leading,
  className = "",
}: {
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  onEscape?: () => void;
  /** Вставка картинок из буфера (скриншот). Нет — файлы из буфера игнорируются. */
  onPasteFiles?: (files: File[]) => void;
  /** Enter отправляет и пустой текст (у сообщения есть картинки). */
  allowEmpty?: boolean;
  /** Кнопка внутри поля слева (например, «прикрепить»), зеркально кнопке эмодзи справа. */
  leading?: ReactNode;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const requestRef = useRef(0);
  const valueRef = useRef(value);
  const composingRef = useRef(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);

  const count = canonicalMessageLength(value);
  const showCount = count >= MESSAGE_CONTENT_COUNTER_FROM;

  const refreshToolbar = useCallback(() => {
    const element = textareaRef.current;
    // Тач: у выделения своё системное меню, плашка форматирования его перекрывала бы.
    if (!element || menu || isTouchInput()) {
      setToolbar(null);
      return;
    }
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    if (start === end) {
      setToolbar(null);
      return;
    }
    const anchor = selectionAnchor(element);
    if (!anchor) {
      setToolbar(null);
      return;
    }
    setToolbar({ ...anchor, start, end });
  }, [menu]);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    const full = element.scrollHeight;
    element.style.height = `${Math.min(full, MAX_HEIGHT_PX)}px`;
    element.style.overflowY = full > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [value, showCount]);

  useEffect(() => {
    const selection = pendingSelection.current;
    pendingSelection.current = null;
    const element = textareaRef.current;
    if (selection && element) {
      element.focus();
      element.setSelectionRange(selection.start, selection.end);
    }
    if (valueRef.current !== value) {
      valueRef.current = value;
      requestRef.current += 1;
      setMenu(null);
    }
    refreshToolbar();
  }, [refreshToolbar, value]);

  // Выделение может сняться без событий поля (клик вне, Esc, программно): следим за документом.
  useEffect(() => {
    const onSelectionChange = () => {
      if (document.activeElement === textareaRef.current) {
        refreshToolbar();
      } else {
        setToolbar(null);
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [refreshToolbar]);

  const closeMenu = useCallback(() => {
    requestRef.current += 1;
    setMenu(null);
  }, []);

  function commit(next: string, caret: number | null, restoreCaret: boolean) {
    const normalized = normalizeComposerText(next, caret);
    const element = textareaRef.current;
    const transformed = normalized.text !== next;
    if (normalized.text === value) {
      if (element && element.value !== normalized.text) {
        element.value = normalized.text;
      }
      if (element && normalized.caret != null && (restoreCaret || normalized.caret !== caret)) {
        element.setSelectionRange(normalized.caret, normalized.caret);
      }
      return;
    }
    if ((restoreCaret || transformed) && normalized.caret != null) {
      pendingSelection.current = { start: normalized.caret, end: normalized.caret };
    }
    onValueChange(normalized.text);
  }

  function applyFormat(kind: FormatKind) {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    if (start === end) {
      return;
    }
    const result = toggleFormat(value, start, end, kind);
    pendingSelection.current = { start: result.start, end: result.end };
    if (result.text === value) {
      element.focus();
      element.setSelectionRange(result.start, result.end);
      refreshToolbar();
      return;
    }
    onValueChange(result.text);
  }

  function insertText(text: string) {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? start;
    commit(value.slice(0, start) + text + value.slice(end), start + text.length, true);
  }

  function onContextMenu(event: MouseEvent<HTMLTextAreaElement>) {
    // Тач: системное меню выделения и вставки лучше своего (и наше его ломало бы).
    if (isTouchInput()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    const x = event.clientX;
    const y = event.clientY;
    const request = ++requestRef.current;
    setToolbar(null);
    void (async () => {
      const clip = await peekClipboardText();
      if (request !== requestRef.current) {
        return;
      }
      setMenu({
        x,
        y,
        start,
        end,
        canPaste: clip === null || clip.length > 0,
      });
    })();
  }

  function placeRange(start: number, end: number) {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.focus();
    element.setSelectionRange(start, end);
  }

  async function copySelection() {
    if (!menu || menu.start === menu.end) {
      return;
    }
    const { start, end } = menu;
    closeMenu();
    await writeClipboardText(value.slice(start, end));
    placeRange(start, end);
  }

  async function cutSelection() {
    if (!menu || menu.start === menu.end) {
      return;
    }
    const { start, end } = menu;
    const selected = value.slice(start, end);
    closeMenu();
    const wrote = await writeClipboardText(selected);
    if (!wrote) {
      placeRange(start, end);
      return;
    }
    commit(value.slice(0, start) + value.slice(end), start, true);
  }

  async function pasteAtSelection() {
    if (!menu) {
      return;
    }
    const { start, end } = menu;
    const text = await readClipboardText();
    closeMenu();
    if (!text) {
      placeRange(start, end);
      return;
    }
    commit(value.slice(0, start) + text + value.slice(end), start + text.length, true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    const formatKind = formatKindFromShortcut(event);
    if (formatKind) {
      event.preventDefault();
      applyFormat(formatKind);
      return;
    }
    if (event.key === "Escape") {
      if (menu) {
        return;
      }
      onEscape?.();
      return;
    }
    // Тач: Enter — перенос строки (как в мобильных мессенджерах), отправка — кнопкой.
    if (event.key === "Enter" && !event.shiftKey && !isTouchInput()) {
      event.preventDefault();
      if (canSendMessageDraft(value) || (allowEmpty && canonicalMessageLength(value) === 0)) {
        onSubmit?.();
      }
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!onPasteFiles) {
      return;
    }
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) {
      return;
    }
    // Скриншот или скопированный файл: текстом его не вставляем.
    event.preventDefault();
    onPasteFiles(files);
  }

  const hasSelection = menu != null && menu.start !== menu.end;

  function onMenuAction(key: string | number) {
    if (key === "cut") {
      void cutSelection();
    } else if (key === "copy") {
      void copySelection();
    } else if (key === "paste") {
      void pasteAtSelection();
    }
  }

  return (
    <Composer className={cx("relative min-w-0 flex-1 has-[textarea[aria-invalid=true]]:border-danger", className)}>
      <ComposerTextarea
        ref={textareaRef}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-invalid={count > MESSAGE_CONTENT_LIMIT}
        className={cx("pr-12 leading-5", leading && "pl-12", showCount && "pb-8")}
        style={{ maxHeight: MAX_HEIGHT_PX }}
        onChange={(event) => {
          if (composingRef.current) {
            onValueChange(event.target.value);
            return;
          }
          commit(event.target.value, event.target.selectionStart, false);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          commit(event.currentTarget.value, event.currentTarget.selectionStart, true);
        }}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onSelect={refreshToolbar}
        onFocus={refreshToolbar}
        // Панель форматирования не должна висеть, когда поле потеряло фокус (клик мимо, смена окна).
        onBlur={() => setToolbar(null)}
        onMouseUp={refreshToolbar}
        onScroll={refreshToolbar}
        onKeyUp={refreshToolbar}
      />
      {showCount ? (
        <span className="pointer-events-none absolute bottom-2.5 right-12 font-label text-[10px] text-muted" aria-live="polite">
          {count} / {MESSAGE_CONTENT_LIMIT}
        </span>
      ) : null}
      {leading ? <div className="absolute bottom-[5px] left-1.5">{leading}</div> : null}
      <EmojiPickerButton onPick={insertText} />
      {toolbar ? (
        <FormatToolbar
          x={toolbar.x}
          y={toolbar.y}
          value={value}
          start={toolbar.start}
          end={toolbar.end}
          onToggle={applyFormat}
        />
      ) : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          aria-label="Редактирование текста"
          disabledKeys={menu.canPaste ? [] : ["paste"]}
          onAction={onMenuAction}
        >
          {hasSelection ? (
            <MenuItem id="cut" icon="scissors">
              Вырезать
            </MenuItem>
          ) : null}
          {hasSelection ? (
            <MenuItem id="copy" icon="copy">
              Копировать
            </MenuItem>
          ) : null}
          <MenuItem id="paste" icon="clipboard">
            Вставить
          </MenuItem>
        </ContextMenu>
      ) : null}
    </Composer>
  );
}

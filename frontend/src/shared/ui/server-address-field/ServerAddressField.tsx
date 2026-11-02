import { useEffect, useRef, useState } from 'react';
import { ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { getServerHistory, guessScheme, isDesktopApp, serverAddressWarning } from '@/shared/lib/server-target';
import { IconButton } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/text-field';

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Адрес сервера (только desktop): схема — неизменяемый префикс слева, в поле вводится домен или IP.
 * Вставленный адрес с `https://` обрезается; нужная схема дописывается при подключении (`normalizeServerUrl`).
 * Если клиент уже подключался к серверам, справа стрелка, а по нажатию на поле открывается их список.
 * Список закрывается кликом (ЛКМ или ПКМ) в любом другом месте, по Esc и как только адрес начали править.
 */
export function ServerAddressField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Ошибка подключения: показывается вместо подсказки. */
  error?: string | null;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Ширина списка = ширине поля; замеряем при открытии.
  const [listWidth, setListWidth] = useState<number>();
  const openList = (next: boolean) => {
    if (next) {
      setListWidth(fieldRef.current?.offsetWidth);
    }
    setOpen(next);
  };
  const listRef = useRef<HTMLElement>(null);

  // Список немодальный (фокус остаётся в поле), поэтому клики снаружи react-aria не ловит — закрываем сами.
  useEffect(() => {
    if (!open) {
      return;
    }
    const inside = (target: EventTarget | null, ...roots: (HTMLElement | null)[]) =>
      target instanceof Node && roots.some((root) => root?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0 && !inside(event.target, fieldRef.current, listRef.current)) {
        setOpen(false);
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!inside(event.target, listRef.current)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const [history] = useState(() => getServerHistory().map((origin) => origin.replace(SCHEME_RE, '')));

  if (!isDesktopApp()) {
    return null;
  }
  const hasHistory = history.length > 0;
  return (
    <div
      onClick={(event) => {
        if (hasHistory && !(event.target as HTMLElement).closest('button')) {
          openList(true);
        }
      }}
    >
      <TextField
        label="Адрес сервера"
        value={value}
        onChange={(next) => {
          setOpen(false);
          onChange(next.replace(SCHEME_RE, ''));
        }}
        addonStart={`${guessScheme(value.trim())}://`}
        placeholder="hooba.example.com"
        autoComplete="url"
        inputMode="url"
        hint={serverAddressWarning(value) ?? 'Домен или IP вашего VPS'}
        error={error}
        isRequired
        fieldRef={fieldRef}
        trailing={
          hasHistory ? (
            <IconButton
              icon="chevron-down"
              label="Прошлые серверы"
              onPress={() => openList(!open)}
              excludeFromTabOrder
              className={open ? 'rotate-180' : undefined}
            />
          ) : undefined
        }
      />
      {hasHistory ? (
        <Popover
          ref={listRef}
          triggerRef={fieldRef}
          isOpen={open}
          onOpenChange={setOpen}
          isNonModal
          placement="bottom start"
          style={{ width: listWidth }}
          offset={4}
          className="z-50 max-h-60 overflow-auto border border-line-strong bg-elevated p-1 shadow-pop"
        >
          <ListBox
            aria-label="Прошлые серверы"
            items={history.map((id) => ({ id }))}
            onAction={(key) => {
              onChange(String(key));
              setOpen(false);
            }}
            className="outline-none"
          >
            {(item) => (
              <ListBoxItem
                id={item.id}
                textValue={item.id}
                className="cursor-pointer truncate px-2.5 py-2 text-[13px] text-muted outline-none data-[focused]:bg-brand-soft data-[focused]:text-fg data-[hovered]:bg-brand-soft data-[hovered]:text-fg"
              >
                {item.id}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      ) : null}
    </div>
  );
}

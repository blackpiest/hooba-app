import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode, type Ref } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { cx } from "@/utils/cx";
import { useIsTouch } from "@/hooks/use-breakpoint";
import { contextMenuEventAt, useLongPress } from "@/shared/lib/use-long-press";
import { Icon, IconButton, listItemClass, Tooltip, type IconName } from "@/shared/ui";

function assignRef(ref: Ref<HTMLElement> | null, node: HTMLElement | null) {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

export const ChannelItem = forwardRef<
  HTMLElement,
  {
    icon: IconName;
    label: string;
    id: string;
    active?: boolean;
    /** Есть непрочитанное: название ярче и жирнее. */
    unread?: boolean;
    /** Голосовой канал: клик без навигации. Без него клик открывает текстовый канал. */
    onClick?: () => void;
    /** Текстовый канал: срабатывает и если маршрут уже открыт. */
    onNavigate?: () => void;
    onContextMenu?: (event: MouseEvent) => void;
    trailing?: ReactNode;
    /** Комната полная: курсор «нельзя», клик не зовёт onClick. disabled не ставим — ПКМ должен жить. */
    blocked?: boolean;
    locked?: boolean;
    /** Слушатели перетаскивания (dnd-kit). */
    dragListeners?: HTMLAttributes<HTMLElement>;
    dragAttributes?: HTMLAttributes<HTMLElement>;
    /** true — жест уже стал перетаскиванием, клик и переход нужно отменить. */
    swallowDragClick?: (event: MouseEvent<HTMLElement>) => boolean;
  }
>(function ChannelItem(
  {
    icon,
    label,
    id,
    active,
    unread,
    onClick,
    onNavigate,
    onContextMenu,
    trailing,
    blocked,
    locked,
    dragListeners,
    dragAttributes,
    swallowDragClick,
  },
  ref,
) {
  const isTouch = useIsTouch();
  const navigate = useNavigate();
  const channelPath = `/app/channels/${id}`;
  // Как у бывшего NavLink: активен и на вложенных маршрутах канала.
  const channelMatch = useMatch({ path: channelPath, end: false });
  // Тач: ПКМ нет — то же меню по долгому нажатию и по кнопке «…» справа.
  const touchMenu = isTouch && onContextMenu ? onContextMenu : null;
  const longPress = useLongPress(touchMenu ? (point) => touchMenu(contextMenuEventAt(point)) : null);
  const withMenuButton = (item: ReactNode) =>
    touchMenu ? (
      <div className="flex items-center" {...longPress}>
        <div className="min-w-0 flex-1">{item}</div>
        <IconButton
          icon="more-h"
          label={`Действия: ${label}`}
          size="sm"
          onPress={(event) => {
            const rect = event.target.getBoundingClientRect();
            touchMenu(contextMenuEventAt({ x: rect.left, y: rect.bottom + 4 }));
          }}
        />
      </div>
    ) : (
      item
    );
  const content = (
    <>
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <Icon name={icon} size="sm" />
        {locked ? (
          <Tooltip content="Приватный канал" plain>
            <span aria-label="Приватный канал" className="absolute -bottom-1 -right-1.5 bg-bg text-fg">
              <Icon name="lock" size="xs" className="size-[9px]" />
            </span>
          </Tooltip>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );

  // Текстовый канал — тоже кнопка, а не ссылка: у <a> браузер сам запускает drag (дроп открывал URL
  // и перезагружал приложение), а на мобильных по долгому нажатию показывает превью ссылки.
  const selected = onClick ? !!active : !!channelMatch || !!active;

  return withMenuButton(
    <button
      ref={(node) => assignRef(ref, node)}
      type="button"
      {...(dragAttributes as HTMLAttributes<HTMLButtonElement>)}
      {...(dragListeners as HTMLAttributes<HTMLButtonElement>)}
      aria-current={selected ? (onClick ? "true" : "page") : undefined}
      aria-disabled={blocked || undefined}
      className={cx(
        onClick
          ? // Голосовой канал не выделяется плашкой: активный отличается только белым текстом и иконкой.
            cx(listItemClass({ unread }), active && "text-fg", "cursor-pointer")
          : cx(listItemClass({ active: selected, unread }), selected ? "cursor-default" : "cursor-pointer"),
        "outline-none focus-visible:[outline:var(--ds-focus-ring)] focus-visible:-outline-offset-2",
        blocked && "cursor-not-allowed",
      )}
      onClick={(event) => {
        if (swallowDragClick?.(event)) {
          return;
        }
        if (onClick) {
          if (!blocked) {
            onClick();
          }
          return;
        }
        if (!channelMatch) {
          navigate(channelPath);
        }
        onNavigate?.();
      }}
      onContextMenu={onContextMenu}
    >
      {content}
    </button>,
  );
});

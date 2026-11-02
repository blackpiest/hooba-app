import type { MouseEvent, ReactNode } from "react";
import { UserAvatar } from "@/shared/ui/user-avatar/UserAvatar";
import { IconButton, SpeakingEq, VoiceStateIcon } from "@/shared/ui";
import { cx } from "@/utils/cx";
import { useIsTouch } from "@/hooks/use-breakpoint";
import { contextMenuEventAt, useLongPress } from "@/shared/lib/use-long-press";

export function VoiceMember({
  userId,
  name,
  initials,
  active = false,
  muted = false,
  deafened = false,
  trailing,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
  onClick,
}: {
  /** Для аватара из пресетов; без него — буквенный. */
  userId?: number;
  name: string;
  initials: string;
  /** Обводка аватара (говорит). */
  active?: boolean;
  muted?: boolean;
  deafened?: boolean;
  trailing?: ReactNode;
  onMouseEnter?: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  /** Клик — мини-профиль; `currentTarget` — якорь карточки. */
  onClick?: (target: HTMLDivElement) => void;
}) {
  const isTouch = useIsTouch();
  // Тач: ПКМ нет — меню по долгому нажатию и по кнопке «…».
  const touchMenu = isTouch && onContextMenu ? onContextMenu : null;
  const longPress = useLongPress(touchMenu ? (point) => touchMenu(contextMenuEventAt<HTMLDivElement>(point)) : null);
  return (
    <div
      {...longPress}
      className={cx(
        // Аватар — на линии названия канала: px-2.5 + иконка 16 + gap 10 у ChannelItem = pl-9.
        "flex min-h-9 items-center gap-2.5 py-1 pl-9 pr-2.5 text-[13px] text-muted",
        onClick &&
          "cursor-pointer outline-none hover:bg-surface hover:text-fg focus-visible:[outline:var(--ds-focus-ring)] focus-visible:-outline-offset-2",
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-haspopup={onClick ? "dialog" : undefined}
      data-profile-trigger={onClick ? "" : undefined}
      onClick={onClick ? (event) => onClick(event.currentTarget) : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick(event.currentTarget);
              }
            }
          : undefined
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={
        onContextMenu
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu(event);
            }
          : undefined
      }
    >
      <UserAvatar userId={userId} name={name || initials} size="sm" speaking={active} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {active ? <SpeakingEq /> : null}
      {muted ? <VoiceStateIcon kind="muted" /> : null}
      {deafened ? <VoiceStateIcon kind="deafened" /> : null}
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
      {touchMenu ? (
        // Нажатие на «…» не должно открывать ещё и профиль (onClick строки).
        <span className="-my-1 -mr-1.5 shrink-0" onClick={(event) => event.stopPropagation()}>
          <IconButton
            icon="more-h"
            label={`Действия: ${name}`}
            size="sm"
            onPress={(event) => {
              const rect = event.target.getBoundingClientRect();
              touchMenu(contextMenuEventAt<HTMLDivElement>({ x: rect.left, y: rect.bottom + 4 }));
            }}
          />
        </span>
      ) : null}
    </div>
  );
}

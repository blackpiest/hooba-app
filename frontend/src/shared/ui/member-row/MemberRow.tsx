import type { UserDirectoryEntry } from "@/shared/api/users";
import { displayNameOf } from "@/shared/lib/display-name";
import { IconButton, ListItem } from "@/shared/ui";
import { UserAvatar } from "@/shared/ui/user-avatar/UserAvatar";
import { UserBadgeMark } from "@/shared/ui/user-avatar/UserBadgeMark";
import { useShowcase } from "@/stores/avatar-store";

export function MemberRow({
  data,
  className,
  onOpenProfile,
  onOpenActions,
}: {
  data: UserDirectoryEntry;
  className?: string;
  /** Клик по участнику — мини-профиль; `anchor` — кнопка-якорь карточки. */
  onOpenProfile?: (anchor: HTMLElement) => void;
  /** Меню действий: ПКМ по строке (точка — курсор) или кнопка «…» (точка — под кнопкой). */
  onOpenActions?: (point: { x: number; y: number }) => void;
}) {
  const name = displayNameOf(data);
  const playing = data.status !== "offline" && data.game ? `Играет в ${data.game}` : undefined;
  // Игра важнее титула: вторая строка одна.
  const title = useShowcase(data.id).title?.label;
  return (
    <ListItem
      size="lg"
      className={className}
      leading={<UserAvatar userId={data.id} name={name} status={data.status} />}
      description={playing ?? title ?? undefined}
      aria-label={`Профиль: ${name}`}
      aria-haspopup="dialog"
      data-profile-trigger=""
      isDisabled={!onOpenProfile}
      onPress={(event) => {
        const anchor = event.target.closest<HTMLElement>("[data-profile-trigger]");
        if (anchor) {
          onOpenProfile?.(anchor);
        }
      }}
      onContextMenu={
        onOpenActions
          ? (event) => {
              event.preventDefault();
              onOpenActions({ x: event.clientX, y: event.clientY });
            }
          : undefined
      }
      actions={onOpenActions ? <IconButton icon="more-h" label={`Действия: ${name}`} size="sm"
          onPress={(event) => {
            const rect = event.target.getBoundingClientRect();
            onOpenActions({ x: rect.left, y: rect.bottom + 4 });
          }}
        /> : undefined}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{name}</span>
        <UserBadgeMark userId={data.id} />
      </span>
    </ListItem>
  );
}

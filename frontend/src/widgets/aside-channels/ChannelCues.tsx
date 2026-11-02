import type { ReactNode } from "react";
import { IconButton, ListGroup, UnreadDot, Icon } from "@/shared/ui";
import { VOICE_ROOM_MAX_USERS } from "@/stores/voice-room-capacity";

/** Справа у текстового канала: «уведомления заглушены» и точка «есть непрочитанное». */
export function ChannelCue({ muted, unread }: { muted: boolean; unread: boolean }) {
  if (!muted && !unread) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {muted ? (
        <span role="img" aria-label="Уведомления заглушены" className="flex text-disabled-text">
          <Icon name="volume-off" size="xs" />
        </span>
      ) : null}
      {unread ? <UnreadDot /> : null}
    </span>
  );
}

/** Занятость голосовой комнаты «3/8». */
export function VoiceOccupancy({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }
  return (
    <span className="shrink-0 font-label text-[10px] tabular-nums text-muted" aria-label={`${count} из ${VOICE_ROOM_MAX_USERS}`}>
      <span aria-hidden="true">
        {count}/{VOICE_ROOM_MAX_USERS}
      </span>
    </span>
  );
}

/** Группа каналов: заголовок с кнопкой «добавить» (для staff) и список. */
export function ChannelGroup({
  title,
  canAdd,
  onAdd,
  children,
}: {
  title: string;
  canAdd: boolean;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mb-1">
      <ListGroup
        label={title}
        action={canAdd ? <IconButton icon="plus" label={`Добавить: ${title}`} size="sm" onPress={onAdd} /> : undefined}
      />
      {children}
    </section>
  );
}

import type { ChannelDto } from "@/shared/api/channels";
import { VOICE_ROOM_MAX_USERS } from "@/stores/voice-room-capacity";
import { Alert, EmptyState, ListItem, Modal } from "@/shared/ui";

/** Выбор канала, в который staff переносит участника голосовой комнаты. */
export function MoveVoiceMemberDialog({
  username,
  rooms,
  occupancy,
  busyId,
  error,
  onPick,
  onClose,
}: {
  username: string;
  /** Каналы, куда можно переместить (без текущего). */
  rooms: ChannelDto[];
  occupancy: (channelId: number) => number;
  busyId: number | null;
  error: string | null;
  onPick: (channelId: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen
      size="sm"
      title="Переместить"
      subtitle={username}
      isDismissable={busyId == null}
      onClose={() => {
        if (busyId == null) {
          onClose();
        }
      }}
    >
      <div className="flex flex-col gap-3">
        {rooms.length === 0 ? (
          <EmptyState compact title="Других голосовых каналов нет" />
        ) : (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {rooms.map((room) => {
              const count = occupancy(room.id);
              return (
                <ListItem
                  key={room.id}
                  icon="speaker"
                  isDisabled={count >= VOICE_ROOM_MAX_USERS || busyId != null}
                  onPress={() => onPick(room.id)}
                  trailing={
                    <span className="font-label text-[10px] tabular-nums">
                      {count}/{VOICE_ROOM_MAX_USERS}
                    </span>
                  }
                >
                  {room.name}
                </ListItem>
              );
            })}
          </div>
        )}
        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

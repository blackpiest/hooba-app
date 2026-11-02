import { ContextMenu, MenuItem, MenuSeparator } from "@/shared/ui";

export type ChannelMenuTarget = {
  x: number;
  y: number;
  id: number;
  name: string;
  voice: boolean;
};

export type ChannelMenuAction = "mute" | "join" | "leave" | "edit" | "delete";

/** Контекстное меню канала: уведомления, вход/выход, редактирование и удаление (staff). */
export function ChannelContextMenu({
  target,
  notificationsMuted,
  showJoin,
  showLeave,
  isAdmin,
  onClose,
  onAction,
}: {
  target: ChannelMenuTarget;
  notificationsMuted: boolean;
  showJoin: boolean;
  showLeave: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onAction: (action: ChannelMenuAction) => void;
}) {
  return (
    <ContextMenu x={target.x} y={target.y} onClose={onClose} aria-label={`Канал ${target.name}`} onAction={(key) => onAction(key as ChannelMenuAction)}>
      {!target.voice ? (
        <MenuItem id="mute" icon={notificationsMuted ? "speaker" : "volume-off"}>
          {notificationsMuted ? "Включить уведомления" : "Заглушить уведомления"}
        </MenuItem>
      ) : null}
      {showJoin ? (
        <MenuItem id="join" icon="login">
          Присоединиться
        </MenuItem>
      ) : null}
      {showLeave ? (
        <MenuItem id="leave" icon="logout">
          Покинуть
        </MenuItem>
      ) : null}
      {isAdmin ? (
        <>
          <MenuSeparator />
          <MenuItem id="edit" icon="edit">
            Редактировать
          </MenuItem>
          <MenuItem id="delete" icon="trash" danger>
            Удалить канал
          </MenuItem>
        </>
      ) : null}
    </ContextMenu>
  );
}

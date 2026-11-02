import { VolumeSlider } from "@/features/voice/VolumeSlider";
import { Alert, ContextMenu, MenuItem } from "@/shared/ui";

export type MemberMenuTarget = {
  x: number;
  y: number;
  userId: number;
  username: string;
  channelId: number;
  volume: number;
  serverMuted: boolean;
};

export type MemberMenuAction = "mute" | "kick" | "move" | "report";

/** Меню участника голосовой комнаты: личная громкость и (для staff) заглушить / исключить / переместить. */
export function MemberContextMenu({
  target,
  isAdmin,
  canAdjustVolume,
  canReport,
  reported,
  busy,
  error,
  onVolume,
  onClose,
  onAction,
}: {
  target: MemberMenuTarget;
  isAdmin: boolean;
  /** Пожаловаться можно на любого, кроме владельца. */
  canReport: boolean;
  /** У меня уже есть открытая жалоба на этого участника. */
  reported: boolean;
  /** Громкость регулируется, только пока я сам в этой голосовой комнате. */
  canAdjustVolume: boolean;
  busy: boolean;
  error: string | null;
  onVolume: (volume: number) => void;
  onClose: () => void;
  onAction: (action: MemberMenuAction) => void;
}) {
  return (
    <ContextMenu
      x={target.x}
      y={target.y}
      onClose={onClose}
      closeOnAction={false}
      aria-label={`Участник ${target.username}`}
      disabledKeys={busy ? ["mute", "kick", "move"] : []}
      onAction={(key) => onAction(key as MemberMenuAction)}
      header={
        canAdjustVolume || error ? (
          <div className="flex w-56 flex-col gap-2">
            {canAdjustVolume ? <VolumeSlider label="Громкость" value={target.volume} onChange={onVolume} /> : null}
            {error ? (
              <Alert tone="danger" compact>
                {error}
              </Alert>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {isAdmin ? (
        <>
          <MenuItem id="mute" icon={target.serverMuted ? "mic" : "mic-off"}>
            {target.serverMuted ? "Снять заглушение" : "Заглушить микрофон"}
          </MenuItem>
          <MenuItem id="move" icon="chevron-right">
            Переместить
          </MenuItem>
          <MenuItem id="kick" icon="logout" danger>
            Выгнать
          </MenuItem>
        </>
      ) : null}
      {canReport ? (
        <MenuItem id="report" icon="alert" isDisabled={reported}>
          {reported ? "Жалоба на рассмотрении" : "Пожаловаться"}
        </MenuItem>
      ) : null}
    </ContextMenu>
  );
}

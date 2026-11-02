import { useChannelStore } from "@/stores/channel-store";
import { ConfirmDialog } from "@/shared/ui";
import { confirmVoiceSwitch, confirmWatchSwitch } from "./screen-share-session";
import { useScreenShareStore } from "./screen-share-store";

export function ScreenShareSwitchDialogs() {
  const pendingVoiceSwitchId = useScreenShareStore((s) => s.pendingVoiceSwitchId);
  const pendingWatchSwitchId = useScreenShareStore((s) => s.pendingWatchSwitchId);
  const clearVoiceSwitch = useScreenShareStore((s) => s.clearVoiceSwitch);
  const clearWatchSwitch = useScreenShareStore((s) => s.clearWatchSwitch);
  const channels = useChannelStore((s) => s.channels);
  const voiceName =
    pendingVoiceSwitchId == null
      ? ""
      : (channels.find((channel) => channel.id === pendingVoiceSwitchId)?.name ?? "другой канал");
  const watchName =
    pendingWatchSwitchId == null
      ? ""
      : (channels.find((channel) => channel.id === pendingWatchSwitchId)?.name ?? "другой канал");

  return (
    <>
      <ConfirmDialog
        isOpen={pendingVoiceSwitchId != null}
        onClose={clearVoiceSwitch}
        onConfirm={() => {
          void confirmVoiceSwitch();
        }}
        tone="danger"
        title="Завершить демонстрацию?"
        description={`Переход в «${voiceName}» остановит текущую демонстрацию.`}
        cancelLabel="Остаться"
        confirmLabel="Перейти и завершить"
      />
      <ConfirmDialog
        isOpen={pendingWatchSwitchId != null}
        onClose={clearWatchSwitch}
        onConfirm={confirmWatchSwitch}
        title="Перейти к демонстрации?"
        description={`Вы выйдете из текущего голосового канала и подключитесь к «${watchName}».`}
        confirmLabel="Присоединиться"
      />
    </>
  );
}

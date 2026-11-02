import { useEffect, useState } from "react";
import { IconButton, Tooltip } from "@/shared/ui";
import { cx } from "@/utils/cx";
import { leaveVoiceChannel, useVoiceSessionUi } from "./voice-session";
import { getVoiceMediasoupHandle } from "../voice-settings/voice-settings";
import { sendVoiceDeafen, sendVoiceMute } from "@/shared/ws/app-realtime";
import { useChannelStore } from "@/stores/channel-store";
import { useUserStore } from "@/stores/user-store";
import { useVoiceRoomsStore } from "@/stores/voice-rooms-store";
import { useVoiceStore } from "@/stores/voice-store";
import { useScreenShareStore } from "@/features/screenshare/screen-share-store";
import { isTouchInput } from "@/hooks/use-breakpoint";

/** Как у Discord: до 100 мс хорошо, до 200 средне, дальше плохо. */
function voicePingTone(ms: number): "good" | "mid" | "bad" {
  if (ms < 100) {
    return "good";
  }
  if (ms < 200) {
    return "mid";
  }
  return "bad";
}

function useVoicePingMs(): number | null {
  const [pingMs, setPingMs] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      const handle = getVoiceMediasoupHandle();
      if (!handle) {
        if (!cancelled) {
          setPingMs(null);
        }
        return;
      }
      void handle.measurePingMs().then((ms) => {
        if (!cancelled) {
          setPingMs(ms);
        }
      });
    };
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return pingMs;
}

type VoiceSessionProviderProps = {
  activeVoiceChannelName?: string;
};

export function VoiceSessionProvider({
  activeVoiceChannelName,
}: VoiceSessionProviderProps) {
  const intendedId = useVoiceSessionUi((s) => s.intendedChannelId);
  const error = useVoiceSessionUi((s) => s.error);
  const userId = useUserStore((s) => s.me?.id);
  const muted = useVoiceStore(
    (s) => s.participants.find((p) => p.user_id === userId)?.muted ?? false,
  );
  const serverMuted = useVoiceStore(
    (s) => s.participants.find((p) => p.user_id === userId)?.server_muted === true,
  );
  const speakDenied = useVoiceStore(
    (s) => s.participants.find((p) => p.user_id === userId)?.speak_denied === true,
  );
  const deafened = useVoiceStore(
    (s) => s.participants.find((p) => p.user_id === userId)?.deafened ?? false,
  );

  if (intendedId == null || !activeVoiceChannelName) {
    return null;
  }

  return (
    <VoiceConnectionPanel
      channelId={intendedId}
      channelName={activeVoiceChannelName}
      error={error}
      muted={muted}
      serverMuted={serverMuted}
      speakDenied={speakDenied}
      deafened={deafened}
    />
  );
}

function VoiceConnectionPanel({
  channelId,
  channelName,
  error,
  muted,
  serverMuted,
  speakDenied,
  deafened,
}: {
  channelId: number;
  channelName: string;
  error: string | null;
  muted: boolean;
  serverMuted: boolean;
  speakDenied: boolean;
  deafened: boolean;
}) {
  const micLocked = serverMuted || speakDenied;
  const micLockedLabel = serverMuted ? "Микрофон отключён администратором" : "У вас нет права говорить в этом канале";
  const pingMs = useVoicePingMs();
  const tone = pingMs == null ? "good" : voicePingTone(pingMs);
  // Фон нейтральный; качество связи показывают обводка и значение пинга.
  const pingToneClass = tone === "bad" ? "text-danger" : tone === "mid" ? "text-warning" : "text-success";
  const borderToneClass = tone === "bad" ? "border-danger/45" : tone === "mid" ? "border-warning/45" : "border-success/45";
  return (
    <div className={cx("mx-2 mb-2 border bg-surface px-2 py-2", borderToneClass)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-label text-[10px] uppercase text-muted">Голосовая связь</p>
        {pingMs != null ? (
          <p className={cx("font-label text-[10px] tabular-nums", pingToneClass)} aria-label={`Пинг ${pingMs} миллисекунд`}>
            {pingMs} мс
          </p>
        ) : null}
      </div>
      <p className="truncate text-sm font-medium text-fg">{channelName}</p>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      <div className="mt-2 flex gap-1">
        <Tooltip content={micLocked ? micLockedLabel : undefined} plain>
          <span className="flex flex-1">
            <IconButton
              icon={muted ? "mic-off" : "mic"}
              variant={muted ? "danger" : "ghost"}
              className="flex-1"
              isDisabled={micLocked}
              pressed={muted}
              label={micLocked ? micLockedLabel : muted ? "Включить микрофон" : "Выключить микрофон"}
              onPress={() => sendVoiceMute()}
            />
          </span>
        </Tooltip>
        <IconButton
          icon={deafened ? "headphones-off" : "headphones"}
          className="flex-1"
          pressed={deafened}
          label={deafened ? "Включить звук" : "Отключить звук"}
          onPress={() => sendVoiceDeafen()}
        />
        {canCaptureScreen ? <ScreenShareButton channelId={channelId} /> : null}
        <IconButton
          icon="phone-off"
          variant="danger"
          className="flex-1 text-danger"
          label="Покинуть канал"
          onPress={() => leaveVoiceChannel()}
        />
      </div>
    </div>
  );
}

/** Мобильные браузеры (iOS, Android) захват экрана не умеют — кнопку не показываем. */
const canCaptureScreen =
  !isTouchInput() || (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function");

function ScreenShareButton({ channelId }: { channelId: number }) {
  const hosting = useScreenShareStore((s) => s.hosting);
  const openStart = useScreenShareStore((s) => s.openStart);
  const setHosting = useScreenShareStore((s) => s.setHosting);
  const share = useVoiceRoomsStore((s) => s.screenShareByChannelId[channelId] ?? null);
  const meId = useUserStore((s) => s.me?.id ?? null);
  const busyByOther = share != null && meId != null && share.user_id !== meId && !hosting;
  const channelAllows = useChannelStore(
    (s) => s.channels.find((channel) => channel.id === channelId)?.my_permissions?.screen_share,
  );
  const roleAllows = useUserStore((s) => s.me?.permissions?.screen_share);
  const forbidden = (channelAllows ?? roleAllows) === false;
  return (
    <Tooltip content={forbidden && !hosting ? "У вас нет права проводить трансляцию в этом канале" : undefined} plain>
      <span className="flex flex-1">
        <IconButton
          icon={hosting ? "screen-off" : "screen"}
          variant={hosting ? "danger" : "ghost"}
          className="flex-1"
          isDisabled={busyByOther || (forbidden && !hosting)}
          pressed={hosting}
          label={hosting ? "Завершить демонстрацию" : "Демонстрация экрана"}
          onPress={() => {
            if (hosting) {
              void getVoiceMediasoupHandle()?.stopScreenShare().then(() => setHosting(null));
              return;
            }
            openStart();
          }}
        />
      </span>
    </Tooltip>
  );
}

import { useEffect, useState } from "react";
import { IconButton, LoadingDots, Tooltip } from "@/shared/ui";
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

/** Пинг раз в 2 с; пока замера нет — чаще, чтобы значение появилось вместе с зелёной рамкой. */
const PING_INTERVAL_MS = 2000;
const PING_RETRY_MS = 250;

/**
 * Замер стартует заново, как только медиа подключилось (`active`): иначе после «Подключения»
 * панель до 2 с стояла зелёной без числа, ожидая очередного тика старого интервала.
 */
function useVoicePingMs(active: boolean): number | null {
  const [pingMs, setPingMs] = useState<number | null>(null);
  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    let timer = 0;
    const tick = () => {
      const handle = getVoiceMediasoupHandle();
      const measured = handle ? handle.measurePingMs() : Promise.resolve(null);
      void measured.then((ms) => {
        if (cancelled) {
          return;
        }
        setPingMs(ms);
        timer = window.setTimeout(tick, ms == null ? PING_RETRY_MS : PING_INTERVAL_MS);
      });
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // Старое значение не должно мелькнуть при следующем подключении.
      setPingMs(null);
    };
  }, [active]);
  return active ? pingMs : null;
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
  const mediaStatus = useVoiceSessionUi((s) => s.mediaStatus);
  // Пока звук не пошёл, пинга нет, а зелёная рамка обещала бы связь, которой ещё нет.
  // `idle` без ошибки — панель уже видна, а медиа ещё не запущено (первый вход после загрузки):
  // это тоже подключение. Сбой медиа всегда выставляет ошибку, так что «повиснуть» здесь нельзя.
  const connecting = !error && mediaStatus !== "connected";
  const pingMs = useVoicePingMs(mediaStatus === "connected");
  const tone = pingMs == null ? "good" : voicePingTone(pingMs);
  // Фон нейтральный; качество связи показывают обводка и значение пинга.
  const pingToneClass = tone === "bad" ? "text-danger" : tone === "mid" ? "text-warning" : "text-success";
  const borderToneClass = connecting
    ? "border-line"
    : tone === "bad"
      ? "border-danger/45"
      : tone === "mid"
        ? "border-warning/45"
        : "border-success/45";
  return (
    <div className={cx("ds-tone-shift relative mx-2 mb-2 border bg-surface px-2 py-2", borderToneClass)}>
      {/* Связь появилась или сменила качество — от рамки один раз расходится кольцо нового цвета. */}
      {connecting ? null : (
        <span key={tone} aria-hidden="true" className={cx("ds-tone-flash pointer-events-none absolute -inset-px", pingToneClass)} />
      )}
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-label text-[10px] uppercase text-muted">{connecting ? "Подключение" : "Голосовая связь"}</p>
        {connecting ? (
          <LoadingDots tone="muted" size="sm" label="Подключение к голосу" className="self-center" />
        ) : pingMs != null ? (
          <p className={cx("font-label text-[10px] tabular-nums", pingToneClass)} aria-label={`Пинг ${pingMs} миллисекунд`}>
            {pingMs} мс
          </p>
        ) : null}
      </div>
      <p className="truncate text-sm font-medium text-fg">{channelName}</p>
      {connecting && mediaStatus === "rerouting" ? (
        <p className="mt-1 text-xs text-muted">Напрямую не получилось — пробуем запасной путь</p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      <div className="mt-2 flex gap-1">
        <Tooltip content={micLocked ? micLockedLabel : undefined} plain>
          <span className="flex flex-1">
            <IconButton
              icon={muted ? "mic-off" : "mic"}
              variant={muted ? "danger" : "ghost"}
              className="flex-1"
              isDisabled={micLocked || connecting}
              pressed={muted}
              label={micLocked ? micLockedLabel : muted ? "Включить микрофон" : "Выключить микрофон"}
              onPress={() => sendVoiceMute()}
            />
          </span>
        </Tooltip>
        <IconButton
          icon={deafened ? "headphones-off" : "headphones"}
          className="flex-1"
          isDisabled={connecting}
          pressed={deafened}
          label={deafened ? "Включить звук" : "Отключить звук"}
          onPress={() => sendVoiceDeafen()}
        />
        {canCaptureScreen ? <ScreenShareButton channelId={channelId} connecting={connecting} /> : null}
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

function ScreenShareButton({ channelId, connecting }: { channelId: number; connecting: boolean }) {
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
          isDisabled={connecting || busyByOther || (forbidden && !hosting)}
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

import { useEffect, useRef, useState } from "react";
import { Badge, ConfirmDialog, IconButton, Toolbar, Tooltip } from "@/shared/ui";
import { getVoiceMediasoupHandle, useVoiceSettingsStore } from "@/features/voice/voice-settings/voice-settings";
import { useChannelStore } from "@/stores/channel-store";
import { useVoiceRoomsStore } from "@/stores/voice-rooms-store";
import { screenShareErrorText } from "./screen-share-profiles";
import { stopWatchingScreenShare, waitForVoiceHandle } from "./screen-share-session";
import { useScreenShareStore } from "./screen-share-store";
import { usePipBox } from "./use-pip-box";

export function ScreenShareStage({
  membersOpen,
  onToggleMembers,
}: {
  membersOpen: boolean;
  onToggleMembers: () => void;
}) {
  const watchingChannelId = useScreenShareStore((s) => s.watchingChannelId);
  const presentation = useScreenShareStore((s) => s.presentation);
  const watchError = useScreenShareStore((s) => s.watchError);
  const soundMuted = useScreenShareStore((s) => s.soundMuted);
  const hasWatchAudio = useScreenShareStore((s) => s.hasWatchAudio);
  const setSoundMuted = useScreenShareStore((s) => s.setSoundMuted);
  const setWatchError = useScreenShareStore((s) => s.setWatchError);
  const setHasWatchAudio = useScreenShareStore((s) => s.setHasWatchAudio);
  const collapseToPip = useScreenShareStore((s) => s.collapseToPip);
  const expandToStage = useScreenShareStore((s) => s.expandToStage);
  /** Новый handle после переподключения к голосу: старые consumer'ы закрыты, смотрим заново. */
  const mediasoupEpoch = useVoiceSettingsStore((s) => s.mediasoupEpoch);
  const share = useVoiceRoomsStore((s) =>
    watchingChannelId == null ? null : (s.screenShareByChannelId[watchingChannelId] ?? null),
  );
  const channelName = useChannelStore((s) =>
    watchingChannelId == null ? "" : (s.channels.find((channel) => channel.id === watchingChannelId)?.name ?? ""),
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  /** Подтверждение «Прекратить просмотр» привязано к каналу и режиму: смена любого из них закрывает его само. */
  const [confirmStopKey, setConfirmStopKey] = useState<string | null>(null);
  /** Какой поток (канал + handle) уже в кадре; до привязки показываем «Подключение…» вместо чёрного экрана. */
  const [boundKey, setBoundKey] = useState<string | null>(null);
  const watchKey = `${watchingChannelId}:${mediasoupEpoch}`;
  const connecting = boundKey !== watchKey && watchError == null;
  /** Канал, трансляцию которого уже показывали: повторный запуск эффекта — перепривязка после переподключения. */
  const watchedChannelRef = useRef<number | null>(null);
  const isStage = presentation === "stage";
  const stopKey = `${watchingChannelId}:${presentation}`;
  const confirmStop = confirmStopKey === stopKey;

  const pip = usePipBox(frameRef, isStage);

  useEffect(() => {
    if (watchingChannelId == null) {
      watchedChannelRef.current = null;
      return;
    }
    const rebinding = watchedChannelRef.current === watchingChannelId;
    let cancelled = false;
    let unsubscribe = () => {};
    const bound: { video: HTMLVideoElement | null; audio: HTMLAudioElement | null } = {
      video: null,
      audio: null,
    };
    const key = `${watchingChannelId}:${mediasoupEpoch}`;
    setWatchError(null);
    void (async () => {
      try {
        const handle = await waitForVoiceHandle(watchingChannelId);
        if (cancelled) {
          return;
        }
        const media = await handle.watchScreenShare();
        if (cancelled) {
          handle.stopWatchingScreenShare();
          return;
        }
        const video = videoRef.current;
        if (video) {
          bound.video = video;
          video.srcObject = new MediaStream([media.video]);
          await video.play().catch(() => {});
        }
        const audio = audioRef.current;
        if (media.audio && audio) {
          bound.audio = audio;
          audio.srcObject = new MediaStream([media.audio]);
          audio.muted = useScreenShareStore.getState().soundMuted;
          setHasWatchAudio(true);
          await audio.play().catch(() => {});
        } else {
          setHasWatchAudio(false);
        }
        setBoundKey(key);
        watchedChannelRef.current = watchingChannelId;
        unsubscribe = handle.subscribeScreenProducers((snapshot) => {
          if (!snapshot.videoId && useScreenShareStore.getState().watchingChannelId === watchingChannelId) {
            stopWatchingScreenShare();
          }
        });
      } catch (error) {
        if (cancelled || (error instanceof Error && error.message === "cancelled")) {
          return;
        }
        // После переподключения показа уже нет (ведущий тоже отвалился) — закрываем, как при его завершении.
        if (rebinding && error instanceof Error && error.message === "NO_SCREEN_SHARE") {
          stopWatchingScreenShare();
          return;
        }
        setWatchError(screenShareErrorText(error));
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
      if (bound.video) {
        bound.video.srcObject = null;
      }
      if (bound.audio) {
        bound.audio.srcObject = null;
      }
      getVoiceMediasoupHandle()?.stopWatchingScreenShare();
      setHasWatchAudio(false);
    };
  }, [mediasoupEpoch, setHasWatchAudio, setWatchError, watchingChannelId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.muted = soundMuted;
    }
  }, [soundMuted]);

  if (watchingChannelId == null) {
    return null;
  }

  const title = share?.username
    ? `${share.username} демонстрирует экран`
    : channelName
      ? `Демонстрация · ${channelName}`
      : "Демонстрация экрана";
  const liveCaption = share?.username
    ? `${share.username} сейчас показывает`
    : channelName
      ? `Трансляция · ${channelName}`
      : "Трансляция экрана";
  /** Оверлеи stage видны при наведении/фокусе и пока открыт диалог (он в портале, фокус уходит из кадра). */
  const overlayVisibility = confirmStop
    ? "opacity-100"
    : "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100";

  return (
    <div
      ref={frameRef}
      role="region"
      aria-label={title}
      className={
        isStage
          ? "group absolute inset-0 z-10 flex min-h-0 flex-col bg-black"
          : "group absolute z-30 flex flex-col overflow-hidden border border-line-strong bg-black shadow-key"
      }
      style={pip.style}
    >
      {isStage ? null : (
        <div
          className="flex shrink-0 cursor-grab touch-none items-center justify-between gap-2 px-2 py-1 text-white select-none active:cursor-grabbing"
          onPointerDown={pip.onHeaderPointerDown}
        >
          <p className="truncate text-sm font-medium">{title}</p>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100">
            <Tooltip content={hasWatchAudio ? undefined : "В этой демонстрации нет звука"} plain>
              <span className="inline-flex">
                <IconButton
                  icon={soundMuted ? "volume-off" : "speaker"}
                  label={soundMuted ? "Включить звук демонстрации" : "Заглушить звук"}
                  pressed={soundMuted}
                  isDisabled={!hasWatchAudio}
                  onPress={() => setSoundMuted(!soundMuted)}
                />
              </span>
            </Tooltip>
            <IconButton icon="expand" label="Развернуть" onPress={expandToStage} />
            <IconButton icon="close" label="Закрыть просмотр" onPress={() => stopWatchingScreenShare()} />
          </div>
        </div>
      )}
      <div
        className="relative min-h-0 flex-1"
        onDoubleClick={() => {
          if (!isStage) {
            expandToStage();
          }
        }}
      >
        <video ref={videoRef} className="h-full w-full object-contain" autoPlay playsInline draggable={false} />
        <audio ref={audioRef} autoPlay />
        {watchError ? (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white">{watchError}</p>
        ) : connecting ? (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-white/80" aria-live="polite">
            Подключение к трансляции…
          </p>
        ) : null}
        {isStage ? (
          <>
            <div
              className={[
                "pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-linear-to-b from-black/70 to-transparent px-4 pt-3 pb-8 text-white",
                overlayVisibility,
              ].join(" ")}
            >
              <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Badge variant="live">LIVE</Badge>
                <span className="truncate">{liveCaption}</span>
              </p>
              <div className="pointer-events-auto flex shrink-0 items-center gap-1">
                <Tooltip content="Свернуть стрим" placement="bottom">
                  <IconButton icon="shrink" label="Свернуть стрим" onPress={collapseToPip} />
                </Tooltip>
                <Tooltip
                  content={membersOpen ? "Скрыть список участников" : "Показать список участников"}
                  placement="bottom"
                >
                  <IconButton
                    icon={membersOpen ? "chevrons-right" : "chevrons-left"}
                    label={membersOpen ? "Скрыть список участников" : "Показать список участников"}
                    onPress={onToggleMembers}
                  />
                </Tooltip>
              </div>
            </div>
            <div
              className={[
                "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-linear-to-t from-black/70 to-transparent px-4 pt-8 pb-4",
                overlayVisibility,
              ].join(" ")}
            >
              <Toolbar aria-label="Управление просмотром" className="pointer-events-auto gap-1 p-1">
                {hasWatchAudio ? (
                  <Tooltip content={soundMuted ? "Включить звук трансляции" : "Выключить звук трансляции"} placement="top">
                    <IconButton
                      icon={soundMuted ? "volume-off" : "speaker"}
                      label={soundMuted ? "Включить звук трансляции" : "Выключить звук трансляции"}
                      pressed={soundMuted}
                      onPress={() => setSoundMuted(!soundMuted)}
                    />
                  </Tooltip>
                ) : (
                  <Tooltip content="У этой трансляции нет звука" placement="top" plain>
                    <span className="inline-flex">
                      <IconButton icon="volume-off" label="У этой трансляции нет звука" isDisabled />
                    </span>
                  </Tooltip>
                )}
                <Tooltip content="Прекратить просмотр" placement="top">
                  <IconButton
                    icon="screen-off"
                    variant="danger-solid"
                    label="Прекратить просмотр"
                    onPress={() => setConfirmStopKey(stopKey)}
                  />
                </Tooltip>
              </Toolbar>
            </div>
          </>
        ) : (
          <Tooltip content="Изменить размер" plain touch="off" placement="left">
            <div
              role="presentation"
              className="absolute right-0 bottom-0 z-10 size-4 cursor-nwse-resize touch-none border-r-2 border-b-2 border-white/70 touch:size-7"
              onPointerDown={pip.onResizePointerDown}
              onDoubleClick={(event) => event.stopPropagation()}
            />
          </Tooltip>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirmStop}
        onClose={() => setConfirmStopKey(null)}
        title="Прекратить просмотр?"
        description="Трансляция закроется, вернуться можно из списка каналов"
        confirmLabel="Прекратить"
        tone="danger"
        onConfirm={() => {
          setConfirmStopKey(null);
          stopWatchingScreenShare();
        }}
      />
    </div>
  );
}

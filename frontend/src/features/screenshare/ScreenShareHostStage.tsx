import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, ConfirmDialog, IconButton, Meter, Toolbar, Tooltip } from "@/shared/ui";
import { getVoiceMediasoupHandle } from "@/features/voice/voice-settings/voice-settings";
import { SCREEN_SHARE_PROFILES } from "./screen-share-profiles";
import { useScreenShareStore } from "./screen-share-store";
import { usePipBox } from "./use-pip-box";
import { useTrackLevel } from "./use-track-level";

/** Порог «звук идёт» для сглаженного уровня 0–1. */
const AUDIBLE_LEVEL = 0.04;

type HostTracks = { video: MediaStreamTrack | null; audio: MediaStreamTrack | null };

function audioStatus(hasAudio: boolean, muted: boolean, level: number): string {
  if (!hasAudio) {
    return "Звук не передаётся";
  }
  if (muted) {
    return "Звук выключен";
  }
  return level >= AUDIBLE_LEVEL ? "Звук идёт" : "Тишина";
}

/** Превью ведущего: свой захват без SFU, уровень звука, выключение звука на лету и конец показа. */
export function ScreenShareHostStage({
  membersOpen,
  onToggleMembers,
}: {
  membersOpen: boolean;
  onToggleMembers: () => void;
}) {
  const hostChannelId = useScreenShareStore((s) => s.hostChannelId);
  const hostInfo = useScreenShareStore((s) => s.hostInfo);
  const hostView = useScreenShareStore((s) => s.hostView);
  const audioMuted = useScreenShareStore((s) => s.hostAudioMuted);
  const setAudioMuted = useScreenShareStore((s) => s.setHostAudioMuted);
  const openHostView = useScreenShareStore((s) => s.openHostView);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  /** Handle не реактивный: дорожки перечитываем на каждый новый показ (смена канала или данных старта). */
  const tracks = useMemo<HostTracks>(() => {
    if (hostChannelId == null || hostInfo == null) {
      return { video: null, audio: null };
    }
    const stream = getVoiceMediasoupHandle()?.getScreenShareStream() ?? null;
    return { video: stream?.getVideoTracks()[0] ?? null, audio: stream?.getAudioTracks()[0] ?? null };
  }, [hostChannelId, hostInfo]);
  const isStage = hostView === "stage";
  const pip = usePipBox(frameRef, isStage);
  const hasAudio = tracks.audio != null;
  const level = useTrackLevel(hasAudio && !audioMuted ? tracks.audio : null);
  const status = audioStatus(hasAudio, audioMuted, level);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !tracks.video) {
      return;
    }
    video.srcObject = new MediaStream([tracks.video]);
    void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [tracks.video, hostView]);

  useEffect(() => {
    getVoiceMediasoupHandle()?.setScreenAudioEnabled(!audioMuted);
  }, [audioMuted, tracks.audio]);

  if (hostChannelId == null || hostView === "closed") {
    return null;
  }

  const profile = hostInfo ? SCREEN_SHARE_PROFILES[hostInfo.quality] : null;
  const caption = [
    profile ? `${profile.title} · ${profile.hint}` : null,
    hostInfo?.sourceLabel || (hostInfo ? (hostInfo.surface === "monitor" ? "Весь экран" : "Приложение") : null),
  ]
    .filter(Boolean)
    .join(" · ");
  const overlayVisibility = confirmEnd
    ? "opacity-100"
    : "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100";
  const soundLabel = !hasAudio
    ? "В демонстрации нет звука"
    : audioMuted
      ? "Включить звук для зрителей"
      : "Выключить звук для зрителей";

  const soundButton = (
    <Tooltip content={soundLabel} placement={isStage ? "top" : "bottom"} plain={!hasAudio}>
      <span className="inline-flex">
        <IconButton
          icon={!hasAudio || audioMuted ? "volume-off" : "speaker"}
          label={soundLabel}
          pressed={audioMuted}
          isDisabled={!hasAudio}
          onPress={() => setAudioMuted(!audioMuted)}
        />
      </span>
    </Tooltip>
  );
  const endButton = (
    <Tooltip content="Завершить демонстрацию" placement={isStage ? "top" : "bottom"}>
      <IconButton
        icon="screen-off"
        variant="danger-solid"
        label="Завершить демонстрацию"
        onPress={() => setConfirmEnd(true)}
      />
    </Tooltip>
  );

  return (
    <div
      ref={frameRef}
      role="region"
      aria-label="Ваша демонстрация экрана"
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
          <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Badge variant="live">LIVE</Badge>
            <span className="truncate">Вы в эфире</span>
          </p>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100">
            {soundButton}
            <IconButton icon="expand" label="Развернуть" onPress={() => openHostView("stage")} />
            {endButton}
          </div>
        </div>
      )}
      <div
        className="relative min-h-0 flex-1"
        onDoubleClick={() => {
          if (!isStage) {
            openHostView("stage");
          }
        }}
      >
        {/* Свой звук не играем: ведущий услышал бы его дважды, а при захвате экрана — по кругу. */}
        <video ref={videoRef} className="h-full w-full object-contain" autoPlay playsInline muted draggable={false} />
        {isStage ? (
          <>
            <div
              className={[
                "pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-linear-to-b from-black/70 to-transparent px-4 pt-3 pb-8 text-white",
                overlayVisibility,
              ].join(" ")}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <Badge variant="live">LIVE</Badge>
                  <span className="truncate">Вы в эфире</span>
                </p>
                {caption ? <p className="truncate text-xs text-white/70">{caption}</p> : null}
              </div>
              <div className="pointer-events-auto flex shrink-0 items-center gap-1">
                <Tooltip content="Свернуть превью" placement="bottom">
                  <IconButton icon="shrink" label="Свернуть превью" onPress={() => openHostView("pip")} />
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
              <Toolbar aria-label="Управление демонстрацией" className="pointer-events-auto items-center gap-2 p-1">
                <span className="flex items-center gap-2 px-2">
                  <Meter
                    value={Math.round(Math.min(1, level) * 100)}
                    segments={8}
                    aria-label="Уровень звука демонстрации"
                    className="w-20"
                  />
                  <span className="text-xs whitespace-nowrap text-muted" aria-live="polite">
                    {status}
                  </span>
                </span>
                {soundButton}
                {endButton}
              </Toolbar>
            </div>
          </>
        ) : (
          <>
            <span className="pointer-events-none absolute bottom-1 left-2 text-xs text-white/80 drop-shadow">
              {status}
            </span>
            <Tooltip content="Изменить размер" plain touch="off" placement="left">
              <div
                role="presentation"
                className="absolute right-0 bottom-0 z-10 size-4 cursor-nwse-resize touch-none border-r-2 border-b-2 border-white/70 touch:size-7"
                onPointerDown={pip.onResizePointerDown}
                onDoubleClick={(event) => event.stopPropagation()}
              />
            </Tooltip>
          </>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="Завершить демонстрацию?"
        description="Зрители перестанут видеть ваш экран"
        confirmLabel="Завершить"
        tone="danger"
        isPending={ending}
        onConfirm={() => {
          setEnding(true);
          void (getVoiceMediasoupHandle()?.stopScreenShare() ?? Promise.resolve()).finally(() => {
            setEnding(false);
            setConfirmEnd(false);
            useScreenShareStore.getState().setHosting(null);
          });
        }}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { getVoiceMediasoupHandle } from "@/features/voice/voice-settings/voice-settings";
import { useVoiceStore } from "@/stores/voice-store";
import { isDesktopApp } from "@/shared/lib/server-target";
import type { DesktopScreenSource } from "@/shared/lib/server-target";
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Radio,
  RadioGroup,
  SectionLabel,
  SegmentedControl,
  TileGrid,
  toast,
} from "@/shared/ui";
import { captureScreen } from "./capture-screen";
import {
  SCREEN_SHARE_PROFILES,
  screenShareErrorText,
  type ScreenShareQuality,
  type ScreenShareSurface,
} from "./screen-share-profiles";
import { useScreenShareStore } from "./screen-share-store";

export function ScreenShareStartModal() {
  const open = useScreenShareStore((s) => s.startOpen);
  const closeStart = useScreenShareStore((s) => s.closeStart);
  const setHosting = useScreenShareStore((s) => s.setHosting);
  const [quality, setQuality] = useState<ScreenShareQuality>("game");
  const [surface, setSurface] = useState<ScreenShareSurface>("window");
  const [shareAudio, setShareAudio] = useState(true);
  const [sources, setSources] = useState<DesktopScreenSource[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desktop = isDesktopApp();

  useEffect(() => {
    if (!open || !desktop) {
      return;
    }
    let cancelled = false;
    setSourcesError(null);
    void window.hoobaDesktop?.listScreenSources?.()
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setSources(rows);
        setSourceId((current) => current ?? rows.find((row) => row.kind === "window")?.id ?? rows[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setSourcesError("Не удалось получить список окон");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, open]);

  useEffect(() => {
    if (!open || !desktop) {
      return;
    }
    const match = sources.filter((row) => (surface === "monitor" ? row.kind === "screen" : row.kind === "window"));
    setSourceId((current) => (match.some((row) => row.id === current) ? current : (match[0]?.id ?? null)));
  }, [desktop, open, sources, surface]);

  if (!open) {
    return null;
  }

  const visibleSources = sources.filter((row) => (surface === "monitor" ? row.kind === "screen" : row.kind === "window"));
  const profile = SCREEN_SHARE_PROFILES[quality];

  async function start() {
    const channelId = useVoiceStore.getState().activeChannelId;
    const handle = getVoiceMediasoupHandle();
    if (channelId == null || !handle) {
      setError("Сначала подключитесь к голосовому каналу");
      return;
    }
    if (!handle.canPublishScreen()) {
      setError("Переподключитесь к голосовому каналу и попробуйте снова");
      return;
    }
    setBusy(true);
    setError(null);
    let stream: MediaStream | null = null;
    try {
      const captured = await captureScreen({
        profile,
        surface,
        shareAudio,
        sourceId: desktop ? sourceId : null,
      });
      stream = captured.stream;
      await handle.publishScreenShare(stream, {
        maxBitrate: profile.maxBitrate,
        maxFramerate: profile.frameRate,
      });
      const sourceLabel = desktop
        ? (sources.find((row) => row.id === sourceId)?.name ?? null)
        : (stream.getVideoTracks()[0]?.label ?? null);
      setHosting(channelId, {
        quality,
        surface,
        sourceLabel: sourceLabel?.trim() || null,
        hasAudio: stream.getAudioTracks().length > 0,
      });
      closeStart();
      if (captured.audioFailed) {
        toast.warning(
          "Демонстрация без звука",
          "Не удалось захватить звук системы. Проверьте устройство вывода звука и перезапустите показ",
        );
      }
    } catch (startError) {
      stream?.getTracks().forEach((track) => track.stop());
      const text = screenShareErrorText(startError);
      if (text !== "Показ экрана отменён") {
        setError(text);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen
      size="lg"
      icon="screen"
      title="Демонстрация экрана"
      subtitle="Выберете, что хотите показать зрителям"
      isDismissable={!busy}
      onClose={() => {
        if (!busy) {
          closeStart();
        }
      }}
      footer={
        <>
          <Button variant="ghost" isDisabled={busy} onPress={closeStart}>
            Отмена
          </Button>
          <Button
            isPending={busy}
            isDisabled={desktop && !sourceId}
            onPress={() => {
              void start();
            }}
          >
            Начать демонстрацию
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SegmentedControl
          aria-label="Что показать"
          value={surface}
          onChange={(value) => setSurface(value as ScreenShareSurface)}
          options={[
            { value: "window", label: "Приложение", icon: "screen" },
            { value: "monitor", label: "Весь экран", icon: "image" },
          ]}
          className="self-start"
        />

        {desktop ? (
          visibleSources.length > 0 ? (
            <TileGrid
              label="Источник"
              aspect="video"
              columns={{ base: 2, wide: 3 }}
              className="max-h-64 grid-cols-2 overflow-y-auto sm:grid-cols-3"
              items={visibleSources}
              selectedId={sourceId}
              onSelect={setSourceId}
              getLabel={(source) => source.name || "Без названия"}
              renderTile={(source) => (
                <>
                  {source.thumbnail ? (
                    <img src={source.thumbnail} alt="" className="size-full bg-black object-cover" />
                  ) : (
                    <span className="block size-full bg-black/40" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-2 py-1 text-xs text-fg">
                    {source.name || "Без названия"}
                  </span>
                </>
              )}
            />
          ) : (
            <Alert tone="info" compact>
              {sourcesError ?? "Нет доступных источников"}
            </Alert>
          )
        ) : (
          <p className="text-sm text-muted">
            После старта браузер попросит выбрать {surface === "monitor" ? "экран" : "окно приложения"}.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <SectionLabel>Качество</SectionLabel>
          <RadioGroup
            aria-label="Качество"
            value={quality}
            onChange={(value) => setQuality(value as ScreenShareQuality)}
            orientation="horizontal"
          >
            {(Object.keys(SCREEN_SHARE_PROFILES) as ScreenShareQuality[]).map((id) => {
              const item = SCREEN_SHARE_PROFILES[id];
              return (
                <Radio key={id} value={id} variant="card" description={item.hint} className="grow basis-[45%]">
                  {item.title}
                </Radio>
              );
            })}
          </RadioGroup>
        </div>

        <Checkbox isSelected={shareAudio} onChange={setShareAudio}>
          Передавать звук
        </Checkbox>

        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

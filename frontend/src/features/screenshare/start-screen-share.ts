import { getVoiceMediasoupHandle } from "@/features/voice/voice-settings/voice-settings";
import { useVoiceStore } from "@/stores/voice-store";
import { toast } from "@/shared/ui";
import { captureScreen } from "./capture-screen";
import {
  SCREEN_SHARE_PROFILES,
  screenShareErrorText,
  type ScreenShareQuality,
  type ScreenShareSurface,
} from "./screen-share-profiles";
import { useScreenShareStore } from "./screen-share-store";

/** Качество веб-показа: выбора нет — источник и звук выбираются в окне браузера. */
const WEB_QUALITY: ScreenShareQuality = "game";

/**
 * Захват и публикация демонстрации. Ошибки — исключением (текст для пользователя — `screenShareErrorText`).
 * `sourceName` — подпись источника в десктопе; в браузере берётся из дорожки.
 */
export async function startScreenShare(input: {
  quality: ScreenShareQuality;
  surface: ScreenShareSurface;
  shareAudio: boolean;
  sourceId: string | null;
  sourceName?: string | null;
}): Promise<void> {
  const channelId = useVoiceStore.getState().activeChannelId;
  const handle = getVoiceMediasoupHandle();
  if (channelId == null || !handle) {
    throw new Error("Сначала подключитесь к голосовому каналу");
  }
  if (!handle.canPublishScreen()) {
    throw new Error("Переподключитесь к голосовому каналу и попробуйте снова");
  }
  const profile = SCREEN_SHARE_PROFILES[input.quality];
  let stream: MediaStream | null = null;
  try {
    const captured = await captureScreen({
      profile,
      surface: input.surface,
      shareAudio: input.shareAudio,
      sourceId: input.sourceId,
    });
    stream = captured.stream;
    await handle.publishScreenShare(stream, {
      maxBitrate: profile.maxBitrate,
      maxFramerate: profile.frameRate,
    });
    const video = stream.getVideoTracks()[0];
    const sourceLabel = input.sourceName !== undefined ? input.sourceName : (video?.label ?? null);
    // В браузере источник выбран в его окне: «весь экран» узнаём по дорожке.
    const pickedSurface = (video?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface;
    useScreenShareStore.getState().setHosting(channelId, {
      quality: input.quality,
      surface: pickedSurface === "monitor" ? "monitor" : pickedSurface ? "window" : input.surface,
      sourceLabel: sourceLabel?.trim() || null,
      hasAudio: stream.getAudioTracks().length > 0,
    });
    if (captured.audioFailed) {
      toast.warning(
        "Демонстрация без звука",
        "Не удалось захватить звук. Проверьте устройство вывода звука и перезапустите показ",
      );
    }
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

let webStartPending = false;

/** Веб: без модалки Хубы — сразу окно выбора браузера (там же источник и звук). */
export async function startWebScreenShare(): Promise<void> {
  if (webStartPending) {
    return;
  }
  webStartPending = true;
  try {
    await startScreenShare({ quality: WEB_QUALITY, surface: "window", shareAudio: true, sourceId: null });
  } catch (error) {
    // Закрытое окно выбора браузер отдаёт как NotAllowedError «… by user» — это отмена, не ошибка.
    const dismissed = error instanceof Error && error.name === "NotAllowedError" && /by user/i.test(error.message);
    const text = screenShareErrorText(error);
    if (!dismissed && text !== "Показ экрана отменён") {
      toast.error("Демонстрация не началась", text);
    }
  } finally {
    webStartPending = false;
  }
}

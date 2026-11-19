import { isDesktopApp } from "@/shared/lib/server-target";
import { startDesktopAppAudio } from "./desktop-app-audio";
import type { ScreenShareProfile, ScreenShareSurface } from "./screen-share-profiles";

/**
 * Сбой именно звука: на Windows десктоп берёт loopback устройства вывода, и без рабочего
 * устройства getDisplayMedia падает целиком («Could not start audio source»). Прав на это нет.
 */
function isAudioCaptureError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "NotAllowedError" || error.name === "AbortError") {
    return false;
  }
  return /audio/i.test(error.message) || (isDesktopApp() && error.name === "NotReadableError");
}

/** Подсказки окну выбора Chrome; другие браузеры их игнорируют. В lib.dom есть не везде. */
type BrowserAudioHints = {
  systemAudio?: "include" | "exclude";
  windowAudio?: "exclude" | "window" | "system";
};

export async function captureScreen(input: {
  profile: ScreenShareProfile;
  surface: ScreenShareSurface;
  shareAudio: boolean;
  sourceId?: string | null;
}): Promise<{ stream: MediaStream; audioFailed: boolean }> {
  const { profile, surface, shareAudio, sourceId } = input;
  if (isDesktopApp() && !sourceId) {
    throw new Error("Выберите окно или экран");
  }
  const video: MediaTrackConstraints & { displaySurface?: "monitor" | "window" } = {
    width: { ideal: profile.width },
    height: { ideal: profile.height },
    frameRate: { ideal: profile.frameRate, max: profile.frameRate },
  };
  if (!isDesktopApp()) {
    video.displaySurface = surface === "monitor" ? "monitor" : "window";
  }
  /** Без звука самой Hooba (голос канала, звуки): Windows 11, macOS 14.2+; где не умеют — поле игнорируется. */
  const ownAudioExcluded: MediaTrackConstraints & { restrictOwnAudio?: boolean } = { restrictOwnAudio: true };
  const request = async (audio: boolean) => {
    if (isDesktopApp() && sourceId) {
      // Выбор источника одноразовый: main забирает его на каждый getDisplayMedia.
      await window.hoobaDesktop?.prepareScreenCapture?.(sourceId, audio);
    }
    const options: DisplayMediaStreamOptions & BrowserAudioHints = {
      video,
      audio: audio ? ownAudioExcluded : false,
    };
    if (audio && !isDesktopApp()) {
      // Chrome: предлагать звук и у экрана, а у окна — звук только этого приложения (Chrome 141+).
      // Включён ли переключатель «Поделиться звуком» по умолчанию, решает браузер — сайт на это не влияет.
      options.systemAudio = "include";
      options.windowAudio = "window";
    }
    return navigator.mediaDevices.getDisplayMedia(options);
  };
  let stream: MediaStream;
  let audioFailed = false;
  // Десктоп: звук ровно выбранного источника (окно — только его приложение). Без хелпера окно идёт
  // без звука — loopback Electron отдал бы звук всей системы; весь экран — запасным путём через loopback.
  const appAudio = isDesktopApp() && sourceId && shareAudio ? await startDesktopAppAudio(sourceId) : null;
  const systemAudio = shareAudio && !appAudio && !(isDesktopApp() && sourceId?.startsWith("window:"));
  try {
    stream = await request(systemAudio);
  } catch (error) {
    if (!systemAudio || !isAudioCaptureError(error)) {
      appAudio?.stop();
      throw error;
    }
    console.warn("[screen] system audio capture failed, retry without audio", error);
    stream = await request(false);
    audioFailed = true;
  }
  if (appAudio) {
    stream.addTrack(appAudio);
  } else if (shareAudio && !systemAudio) {
    audioFailed = true;
  }
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error("NO_VIDEO_TRACK");
  }
  track.contentHint = profile.contentHint;
  try {
    await track.applyConstraints({
      width: { ideal: profile.width },
      height: { ideal: profile.height },
      frameRate: { ideal: profile.frameRate, max: profile.frameRate },
    });
  } catch {
    /* браузер оставил исходное разрешение источника */
  }
  return { stream, audioFailed };
}

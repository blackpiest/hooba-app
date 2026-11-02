import { isDesktopApp } from "@/shared/lib/server-target";
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
    return navigator.mediaDevices.getDisplayMedia({ video, audio: audio ? ownAudioExcluded : false });
  };
  let stream: MediaStream;
  let audioFailed = false;
  try {
    stream = await request(shareAudio);
  } catch (error) {
    if (!shareAudio || !isAudioCaptureError(error)) {
      throw error;
    }
    console.warn("[screen] system audio capture failed, retry without audio", error);
    stream = await request(false);
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

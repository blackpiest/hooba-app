export type ScreenShareQuality = "game" | "text";

export type ScreenShareSurface = "window" | "monitor";

export type ScreenShareProfile = {
  id: ScreenShareQuality;
  title: string;
  hint: string;
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
  contentHint: "motion" | "detail";
};

export const SCREEN_SHARE_PROFILES: Record<ScreenShareQuality, ScreenShareProfile> = {
  game: {
    id: "game",
    title: "Игровой стрим",
    hint: "720p, 30 кадров/с",
    width: 1280,
    height: 720,
    frameRate: 30,
    maxBitrate: 1_500_000,
    contentHint: "motion",
  },
  text: {
    id: "text",
    title: "Демонстрация экрана",
    hint: "Более чёткий текст, 5 кадров/с",
    width: 1920,
    height: 1080,
    frameRate: 5,
    maxBitrate: 1_200_000,
    contentHint: "detail",
  },
};

export function screenShareErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") {
    return "Доступ к экрану не выдан";
  }
  if (name === "AbortError" || message.includes("AbortError")) {
    return "Показ экрана отменён";
  }
  if (message.includes("SCREEN_SHARE_BUSY")) {
    return "В этом канале уже идёт демонстрация";
  }
  if (message.includes("SCREEN_CODEC_UNAVAILABLE")) {
    return "Переподключитесь к голосовому каналу и попробуйте снова";
  }
  if (message.includes("NO_SCREEN_SHARE")) {
    return "Демонстрация уже завершена";
  }
  if (message === "Голосовой канал не подключился") {
    return message;
  }
  if (message.length > 0 && message.length < 180) {
    return message;
  }
  return "Не удалось показать экран";
}

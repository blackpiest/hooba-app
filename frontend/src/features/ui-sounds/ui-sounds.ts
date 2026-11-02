import authSuccessUrl from "@/assets/sounds/auth-success.wav";
import avatarSelectUrl from "@/assets/sounds/avatar-select.wav";
import cosmeticSelectUrl from "@/assets/sounds/cosmetic-select.wav";
import lockedSelectUrl from "@/assets/sounds/locked-select.wav";
import lofiLobbyUrl from "@/assets/sounds/lofi-lobby.wav";
import profileOpenUrl from "@/assets/sounds/profile-open.wav";
import { createLoopingClip, playClip } from "@/features/voice/voice-channel-sounds";

const AVATAR_SELECT_VOLUME = 0.6;
const PROFILE_OPEN_VOLUME = 0.6;
const LOCKED_SELECT_VOLUME = 0.45;
// «Тик» короткий и частый (листают плитки подряд) — заметно тише выбора персонажа.
const COSMETIC_SELECT_VOLUME = 0.25;

/** Выбор персонажа в конструкторе профиля. */
export function playAvatarSelectSound(): void {
  void playClip(avatarSelectUrl, AVATAR_SELECT_VOLUME);
}

/** Выбор закрытой косметики («ту-дуд»): тише и глуше обычного выбора, чтобы не звучало как ошибка. */
export function playLockedSelectSound(): void {
  void playClip(lockedSelectUrl, LOCKED_SELECT_VOLUME);
}

/** Выбор рамки, фона, значка или титула в конструкторе профиля («тик», как на лендинге). */
export function playCosmeticTickSound(): void {
  void playClip(cosmeticSelectUrl, COSMETIC_SELECT_VOLUME);
}

/**
 * Выбор косметики: закрытая звучит «недоступно»; открытый персонаж — своим звуком, остальное — «тиком».
 */
export function playCosmeticSelectSound(locked: boolean, kind: "character" | "other" = "other"): void {
  if (locked) {
    playLockedSelectSound();
  } else if (kind === "character") {
    playAvatarSelectSound();
  } else {
    playCosmeticTickSound();
  }
}

/** Открытие мини-профиля участника. */
export function playProfileOpenSound(): void {
  void playClip(profileOpenUrl, PROFILE_OPEN_VOLUME);
}

/** Успешный вход или регистрация. */
export function playAuthSuccessSound(): void {
  void playClip(authSuccessUrl);
}

/** Испытание выполнено, награда получена. */
export function playChallengeCompleteSound(): void {
  void playClip(authSuccessUrl);
}

const EDITOR_MUSIC_KEY = "hooba_editor_music";
const EDITOR_MUSIC_VOLUME = 0.5;

/** Музыка в редакторе профиля: по умолчанию включена. */
export function getEditorMusicEnabled(): boolean {
  try {
    return localStorage.getItem(EDITOR_MUSIC_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setEditorMusicEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(EDITOR_MUSIC_KEY, enabled ? "1" : "0");
  } catch {
    /* хранилище недоступно */
  }
}

/** Запускает луп lo-fi музыки; возвращает функцию остановки. */
export function startEditorMusic(): () => void {
  return createLoopingClip(lofiLobbyUrl, EDITOR_MUSIC_VOLUME);
}

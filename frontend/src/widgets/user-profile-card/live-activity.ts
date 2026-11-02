import type { ScreenSharePresentation } from "@/features/screenshare/screen-share-store";
import type { VoiceScreenShare } from "@/stores/voice-rooms-store";

/**
 * Канал, где пользователь сейчас транслирует экран. Только среди видимых каналов: стрим из закрытого
 * канала сервер посторонним и так не присылает, а это второй рубеж на случай устаревшего стора.
 */
export function findLiveChannelId(
  shares: Record<number, VoiceScreenShare>,
  channels: readonly { id: number }[],
  userId: number,
): number | null {
  for (const [id, share] of Object.entries(shares)) {
    const channelId = Number(id);
    if (share.user_id === userId && channels.some((channel) => channel.id === channelId)) {
      return channelId;
    }
  }
  return null;
}

/** Что показать в блоке «Сейчас в эфире»: свой стрим, войти, развернуть из PiP или «уже смотрю». */
export type LiveJoinState = "self" | "join" | "open" | "watching";

export function liveJoinState({
  isSelf,
  liveChannelId,
  watchingChannelId,
  presentation,
}: {
  isSelf: boolean;
  liveChannelId: number;
  watchingChannelId: number | null;
  presentation: ScreenSharePresentation;
}): LiveJoinState {
  if (isSelf) {
    return "self";
  }
  if (watchingChannelId !== liveChannelId) {
    return "join";
  }
  return presentation === "pip" ? "open" : "watching";
}

import type { VoiceParticipant } from "@/stores/voice-store";
import type { VoiceRoomMember } from "@/stores/voice-rooms-store";
import { voiceRoomRoster } from "@/stores/voice-room-capacity";

/** `live` — строка из живого сеанса этого клиента: только у неё есть индикатор речи. */
export type VoiceMemberRow = VoiceRoomMember & { live: boolean };

export function membersForVoiceChannel(
  channelId: number,
  snapshotMembers: VoiceRoomMember[] | undefined,
  activeVoiceChannelId: number | undefined,
  liveChannelId: number | null,
  liveParticipants: VoiceParticipant[],
): VoiceMemberRow[] {
  const roster = voiceRoomRoster({
    channelId,
    snapshot: snapshotMembers,
    activeVoiceChannelId,
    liveChannelId,
    liveParticipants,
  });
  const live = roster === liveParticipants;
  return roster.map((member) => ({
    user_id: member.user_id,
    username: member.username,
    muted: member.muted,
    server_muted: member.server_muted === true,
    deafened: member.deafened,
    live,
  }));
}

export function voiceModerationErrorText(code: string | undefined): string {
  switch (code) {
    case "VOICE_ROOM_FULL":
      return "Канал заполнен";
    case "VOICE_CHANNEL_NOT_FOUND":
    case "INVALID_CHANNEL_TYPE":
      return "Нет доступа к каналу";
    case "FORBIDDEN":
      return "Недостаточно прав";
    case "VOICE_NOT_CONNECTED":
      return "Пользователь уже не в голосовом канале";
    case "SAME_CHANNEL":
      return "Пользователь уже в этом канале";
    case "NOT_FOUND":
      return "Пользователь не найден";
    case "OFFLINE":
      return "Нет связи с сервером";
    default:
      return "Не удалось выполнить действие";
  }
}

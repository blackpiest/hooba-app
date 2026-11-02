import { useVoiceRoomsStore, type VoiceRoomMember } from '@/stores/voice-rooms-store';
import { useVoiceStore, type VoiceParticipant } from '@/stores/voice-store';

/** Тот же product cap, что `VOICE_ROOM_MAX_USERS` в backend/src/modules/voice/voice.types.ts. */
export const VOICE_ROOM_MAX_USERS = 8;

/** Состав, который видит сайдбар: живой сеанс в этой комнате, иначе снимок `voice:rooms_snapshot`. */
export function voiceRoomRoster(params: {
  channelId: number;
  snapshot: VoiceRoomMember[] | undefined;
  activeVoiceChannelId: number | undefined;
  liveChannelId: number | null;
  liveParticipants: VoiceParticipant[];
}): VoiceRoomMember[] | VoiceParticipant[] {
  const useLive =
    params.activeVoiceChannelId === params.channelId &&
    params.liveChannelId === params.channelId &&
    params.liveParticipants.length > 0;
  if (useLive) {
    return params.liveParticipants;
  }
  return params.snapshot ?? [];
}

/** Комната полная, и этот пользователь в ней не сидит. Уже находящийся может переподключиться. */
export function isVoiceRoomClosedTo(
  userId: number | null,
  roster: readonly { user_id: number }[],
): boolean {
  if (roster.length < VOICE_ROOM_MAX_USERS) {
    return false;
  }
  if (userId !== null && roster.some((member) => member.user_id === userId)) {
    return false;
  }
  return true;
}

export function isVoiceChannelClosedInStore(
  channelId: number,
  userId: number | null,
  intendedChannelId: number | null,
): boolean {
  const live = useVoiceStore.getState();
  if (intendedChannelId === channelId || live.activeChannelId === channelId) {
    return false;
  }
  const roster = voiceRoomRoster({
    channelId,
    snapshot: useVoiceRoomsStore.getState().byChannelId[channelId],
    activeVoiceChannelId: undefined,
    liveChannelId: live.activeChannelId,
    liveParticipants: live.participants,
  });
  return isVoiceRoomClosedTo(userId, roster);
}

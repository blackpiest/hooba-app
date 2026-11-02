import { create } from 'zustand';
import { registerSessionClear } from '@/shared/lib/session-reset';

export type VoiceRoomMember = {
  user_id: number;
  username: string;
  muted: boolean;
  server_muted?: boolean;
  speak_denied?: boolean;
  deafened: boolean;
  speaking?: boolean;
};

export type VoiceScreenShare = {
  user_id: number;
  username: string;
};

export type VoiceRoomState = {
  channel_id: number;
  participants: VoiceRoomMember[];
  screen_share?: VoiceScreenShare | null;
};

type VoiceRoomsStore = {
  byChannelId: Record<number, VoiceRoomMember[]>;
  screenShareByChannelId: Record<number, VoiceScreenShare>;
  setFromSnapshot: (rooms: VoiceRoomState[]) => void;
  clear: () => void;
};

function readScreenShare(share: VoiceRoomState['screen_share']): VoiceScreenShare | null {
  if (!share || typeof share.user_id !== 'number' || typeof share.username !== 'string') {
    return null;
  }
  return { user_id: share.user_id, username: share.username };
}

export const useVoiceRoomsStore = create<VoiceRoomsStore>((set) => ({
  byChannelId: {},
  screenShareByChannelId: {},
  setFromSnapshot: (rooms) => {
    const next: Record<number, VoiceRoomMember[]> = {};
    const shares: Record<number, VoiceScreenShare> = {};
    for (const room of rooms) {
      if (!Array.isArray(room.participants) || typeof room.channel_id !== 'number') {
        continue;
      }
      next[room.channel_id] = room.participants.filter(
        (p) => p && typeof p.user_id === 'number' && typeof p.username === 'string',
      );
      const share = readScreenShare(room.screen_share);
      if (share) {
        shares[room.channel_id] = share;
      }
    }
    set({ byChannelId: next, screenShareByChannelId: shares });
  },
  clear: () => set({ byChannelId: {}, screenShareByChannelId: {} }),
}));

registerSessionClear(() => useVoiceRoomsStore.getState().clear());

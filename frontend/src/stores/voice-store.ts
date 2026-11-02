import { create } from 'zustand';
import { registerSessionClear } from '@/shared/lib/session-reset';

export type VoiceParticipant = {
  user_id: number;
  username: string;
  muted: boolean;
  server_muted?: boolean;
  /** Роль запрещает говорить. */
  speak_denied?: boolean;
  deafened: boolean;
  speaking: boolean;
  joined_at: string;
};

/** Стабильная ссылка для селекторов Zustand (нельзя возвращать литерал `[]` из селектора — бесконечный ререндер в React 19). */
export const EMPTY_VOICE_PARTICIPANTS: VoiceParticipant[] = [];
export const EMPTY_INBOUND_HEARING: Record<string, boolean> = {};

type VoiceStore = {
  activeChannelId: number | null;
  participants: VoiceParticipant[];
  /** userId → до этого клиента дошла энергия RTP. Не поле `speaking`. */
  inboundHearing: Record<string, boolean>;
  setJoined: (channelId: number, participants: VoiceParticipant[]) => void;
  applyUserJoined: (channelId: number, user: VoiceParticipant) => void;
  applyUserLeft: (channelId: number, userId: number) => void;
  applyUserState: (
    channelId: number,
    userId: number,
    patch: Partial<Pick<VoiceParticipant, 'muted' | 'server_muted' | 'speak_denied' | 'deafened' | 'speaking'>>,
  ) => void;
  setInboundHearing: (userId: number, hearing: boolean) => void;
  clearIfChannel: (channelId: number) => void;
  clear: () => void;
};

function withoutHearing(hearing: Record<string, boolean>, userId: number): Record<string, boolean> {
  const key = String(userId);
  if (!(key in hearing)) {
    return hearing;
  }
  const next = { ...hearing };
  delete next[key];
  return next;
}

export const useVoiceStore = create<VoiceStore>((set, get) => ({
  activeChannelId: null,
  participants: [],
  inboundHearing: EMPTY_INBOUND_HEARING,
  setJoined: (channelId, participants) =>
    set({ activeChannelId: channelId, participants, inboundHearing: {} }),
  applyUserJoined: (channelId, user) => {
    if (get().activeChannelId !== channelId) return;
    set((s) => ({
      participants: [...s.participants.filter((p) => p.user_id !== user.user_id), user],
    }));
  },
  applyUserLeft: (channelId, userId) => {
    if (get().activeChannelId !== channelId) return;
    set((s) => ({
      participants: s.participants.filter((p) => p.user_id !== userId),
      inboundHearing: withoutHearing(s.inboundHearing, userId),
    }));
  },
  applyUserState: (channelId, userId, patch) => {
    if (get().activeChannelId !== channelId) return;
    set((s) => ({
      participants: s.participants.map((p) =>
        p.user_id === userId ? { ...p, ...patch } : p,
      ),
    }));
  },
  setInboundHearing: (userId, hearing) => {
    const key = String(userId);
    const current = get().inboundHearing[key] === true;
    if (current === hearing) {
      return;
    }
    if (!hearing) {
      set({ inboundHearing: withoutHearing(get().inboundHearing, userId) });
      return;
    }
    set({ inboundHearing: { ...get().inboundHearing, [key]: true } });
  },
  clearIfChannel: (channelId) => {
    if (get().activeChannelId === channelId) {
      set({ activeChannelId: null, participants: [], inboundHearing: {} });
    }
  },
  clear: () => set({ activeChannelId: null, participants: [], inboundHearing: {} }),
}));

registerSessionClear(() => useVoiceStore.getState().clear());

function sameRosterIgnoringSpeaking(a: VoiceParticipant[], b: VoiceParticipant[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.user_id !== y.user_id ||
      x.username !== y.username ||
      x.muted !== y.muted ||
      x.server_muted !== y.server_muted ||
      x.speak_denied !== y.speak_denied ||
      x.deafened !== y.deafened ||
      x.joined_at !== y.joined_at
    ) {
      return false;
    }
  }
  return true;
}

let rosterCache: VoiceParticipant[] = EMPTY_VOICE_PARTICIPANTS;

/**
 * Состав живой комнаты без учёта `speaking`: ссылка меняется только при входе, выходе или смене mute/deafen.
 * Поле `speaking` в возвращённых строках может устареть — индикатор речи читает `useVoiceMemberSpeaking`.
 */
export function selectVoiceRoster(s: { participants: VoiceParticipant[] }): VoiceParticipant[] {
  if (!sameRosterIgnoringSpeaking(rosterCache, s.participants)) {
    rosterCache = s.participants;
  }
  return rosterCache;
}

/** Индикатор речи одного участника: свой — по детектору, чужой — по пришедшей энергии RTP. `null` — не в живой комнате. */
export function useVoiceMemberSpeaking(userId: number | null, meId: number | null): boolean {
  return useVoiceStore((s) => {
    if (userId === null) {
      return false;
    }
    if (userId === meId) {
      return s.participants.find((p) => p.user_id === userId)?.speaking === true;
    }
    return s.inboundHearing[String(userId)] === true;
  });
}

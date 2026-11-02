import type { WebSocket } from 'ws';

export const VOICE_ROOM_MAX_USERS = 8;

export type VoiceParticipantPublic = {
  user_id: number;
  username: string;
  /** Микрофон молчит: свой mute или серверная заглушка. */
  muted: boolean;
  server_muted: boolean;
  /** Роль запрещает говорить: микрофон молчит, пока запрет не снимут. */
  speak_denied: boolean;
  deafened: boolean;
  speaking: boolean;
  joined_at: string;
};

export type VoiceParticipantInternal = {
  userId: number;
  username: string;
  selfMuted: boolean;
  serverMuted: boolean;
  /** Запрет роли. Не запоминается между входами: пересчитывается по ролям при каждом входе. */
  speakDenied: boolean;
  deafened: boolean;
  speaking: boolean;
  joinedAt: number;
  sockets: Set<WebSocket>;
};

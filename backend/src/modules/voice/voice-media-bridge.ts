import type { WebSocket } from 'ws';

let closer: ((socket: WebSocket) => void) | null = null;
export type VoicePauseScope = 'all' | 'microphone';

let producerPauser: ((socket: WebSocket, paused: boolean, scope: VoicePauseScope) => void) | null = null;
let roomIdle: ((channelId: number) => void) | null = null;

export function registerVoiceMediaSocketCloser(fn: (socket: WebSocket) => void): void {
  closer = fn;
}

export function closeVoiceMediaForSocket(socket: WebSocket): void {
  closer?.(socket);
}

export function registerVoiceProducerPauser(
  fn: (socket: WebSocket, paused: boolean, scope: VoicePauseScope) => void,
): void {
  producerPauser = fn;
}

export function registerVoiceRoomIdle(fn: (channelId: number) => void): void {
  roomIdle = fn;
}

export function notifyVoiceRoomIdle(channelId: number): void {
  roomIdle?.(channelId);
}

/**
 * Пауза или возобновление аудио producer на SFU. Вызывающий передаёт эффективный mute.
 * `microphone` — не трогать звук трансляции (запрет роли говорить не глушит стрим).
 */
export function setVoiceProducerPaused(socket: WebSocket, paused: boolean, scope: VoicePauseScope = 'all'): void {
  producerPauser?.(socket, paused, scope);
}

export function mediasoupSignalFailure(): { ok: false; error: 'MEDIASOUP_ERROR' } {
  return { ok: false, error: 'MEDIASOUP_ERROR' };
}

export function isAudioSourceBlockedByServerMute(source: string, serverMuted: boolean): boolean {
  return serverMuted && (source === 'microphone' || source === 'screen-audio');
}

import type { SignalingDebug } from '../../shared/ws/app-realtime';

export type IceReportSnapshot = {
  connectionState: string;
  candidateType: string | null;
  protocol: string | null;
  rttMs: number | null;
};

export type PlaybackSinkState = 'pending' | 'ok' | 'fail' | 'unsupported';

export type VoiceIncidentRemote = {
  userId: number | null;
  producerId: string;
  consumerPaused: boolean;
  trackMuted: boolean;
  trackEnabled: boolean;
  bytesReceived2s: number | null;
  audioLevel: number | null;
  signalSpeaking: boolean;
  audioPaused: boolean;
  userVolume: number;
  sink: PlaybackSinkState;
};

export type VoiceIncidentEvent = {
  at: number;
  message: string;
};

export type VoiceIncidentSnapshot = {
  timeIso: string;
  clientVersion: string;
  userId: number | null;
  channelId: number;
  ws: SignalingDebug;
  send: IceReportSnapshot;
  recv: IceReportSnapshot;
  outbound: {
    producerId: string | null;
    paused: boolean;
    trackMuted: boolean;
    audioContextState: string;
    capturePath: 'graph' | 'raw' | 'none';
    speechModel: 'starting' | 'live' | 'missing' | 'ptt';
    renderLive: boolean | null;
    inputPeak: number | null;
    bytesSent2s: number | null;
  };
  playback: {
    outputVolume: number;
    deafened: boolean;
    playbackContextState: string;
  };
  remotes: VoiceIncidentRemote[];
  events: VoiceIncidentEvent[];
};

function num(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}

function peak(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(4);
}

function level(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(3);
}

function ice(value: string | null): string {
  return value ?? 'n/a';
}

function id(value: number | string | null): string {
  return value === null ? 'n/a' : String(value);
}

function clock(at: number): string {
  const date = new Date(at);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Плоский текст, чтобы два отчёта (говорящий и слушатель) сравнивались глазами. */
export function formatVoiceIncidentReport(snapshot: VoiceIncidentSnapshot): string {
  const lines = [
    'hooba-voice-report 1',
    `time: ${snapshot.timeIso}`,
    `client: ${snapshot.clientVersion}`,
    `user: ${id(snapshot.userId)}`,
    `channel: ${snapshot.channelId}`,
    `ws: ready=${snapshot.ws.readyState} identified=${String(snapshot.ws.identified)} pongAgeMs=${num(snapshot.ws.pongAgeMs)} reconnects=${snapshot.ws.reconnects}`,
    `send: state=${snapshot.send.connectionState} ice=${ice(snapshot.send.candidateType)} proto=${ice(snapshot.send.protocol)} rttMs=${num(snapshot.send.rttMs)}`,
    `recv: state=${snapshot.recv.connectionState} ice=${ice(snapshot.recv.candidateType)} proto=${ice(snapshot.recv.protocol)} rttMs=${num(snapshot.recv.rttMs)}`,
    `outbound: producer=${id(snapshot.outbound.producerId)} paused=${String(snapshot.outbound.paused)} trackMuted=${String(snapshot.outbound.trackMuted)} ctx=${snapshot.outbound.audioContextState} capture=${snapshot.outbound.capturePath} vad=${snapshot.outbound.speechModel} render=${snapshot.outbound.renderLive === null ? 'n/a' : snapshot.outbound.renderLive ? 'yes' : 'no'} inPeak=${peak(snapshot.outbound.inputPeak)} bytesSent2s=${num(snapshot.outbound.bytesSent2s)}`,
    `playback: volumeOut=${snapshot.playback.outputVolume} deafened=${String(snapshot.playback.deafened)} playbackCtx=${snapshot.playback.playbackContextState}`,
  ];
  if (snapshot.remotes.length === 0) {
    lines.push('remote: none');
  } else {
    for (const remote of snapshot.remotes) {
      lines.push(
        `remote: user=${id(remote.userId)} producer=${remote.producerId} consumerPaused=${String(remote.consumerPaused)} trackMuted=${String(remote.trackMuted)} enabled=${String(remote.trackEnabled)} bytesReceived2s=${num(remote.bytesReceived2s)} audioLevel=${level(remote.audioLevel)} signalSpeaking=${String(remote.signalSpeaking)} elPaused=${String(remote.audioPaused)} volumeUser=${remote.userVolume} sink=${remote.sink}`,
      );
    }
  }
  lines.push('events:');
  if (snapshot.events.length === 0) {
    lines.push('  (none)');
  } else {
    for (const event of snapshot.events) {
      lines.push(`  ${clock(event.at)} ${event.message}`);
    }
  }
  return lines.join('\n');
}

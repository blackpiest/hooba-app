import type { Consumer, Producer, Transport } from 'mediasoup-client/types';
import type { RtpCapabilities, RtpParameters } from 'mediasoup-client/types';
import type {
  ScreenProducerSnapshot,
  VoiceMediaDebug,
  VoiceMediasoupHandle,
  VoiceMediasoupOptions,
} from './webrtc-voice.types';
import { getSignalingDebug, requestVoiceSignal, sendVoiceSpeaking, subscribeRealtime } from '../../shared/ws/app-realtime';
import { formatVoiceIncidentReport, type IceReportSnapshot, type PlaybackSinkState, type VoiceIncidentEvent } from './voice-incident-report';
import { useScreenShareStore } from '../screenshare/screen-share-store';
import {
  playStreamJoinedSound,
  playStreamLeftSound,
  playStreamStartSound,
  playStreamStopSound,
} from './voice-channel-sounds';
import { useUserStore } from '../../stores/user-store';
import { useVoiceStore } from '../../stores/voice-store';
import { isPushToTalkActive, subscribeVoiceActivation } from '../../shared/lib/voice-activation-prefs';
import { isPttHeld, subscribePttHeld } from './ptt-state';
import { playPttStartSound, playPttStopSound } from './ptt-sounds';
import { createSpeakingDetector } from './speaking-detector';
import { connectMicChain, micProcessingConstraints } from './voice-mic-chain';
import {
  getInputVolume,
  getOutputVolume,
  getUserVolume,
  subscribeVoiceVolume,
  volumeToGain,
} from '../../shared/lib/voice-volume-prefs';
import { createLimiter, rampGain } from './voice-loudness';
import {
  listenForUserGesture,
  primeVoiceAudioFromUserGesture,
  takePrimedVoiceAudioContext,
} from './voice-audio-unlock';

export type { VoiceMediaDebug, VoiceMediasoupHandle, VoiceMediasoupOptions } from './webrtc-voice.types';

type RtcStat = {
  id?: string;
  type?: string;
  kind?: string;
  state?: string;
  nominated?: boolean;
  selected?: boolean;
  selectedCandidatePairId?: string;
  currentRoundTripTime?: number;
  localCandidateId?: string;
  candidateType?: string;
  protocol?: string;
  bytesSent?: number;
  bytesReceived?: number;
  audioLevel?: number;
  trackIdentifier?: string;
};

function asRtcStat(stat: unknown): RtcStat {
  return stat as RtcStat;
}

function readIceSnapshot(stats: RTCStatsReport): Omit<IceReportSnapshot, 'connectionState'> {
  const records: RtcStat[] = [];
  stats.forEach((raw) => {
    records.push(asRtcStat(raw));
  });
  let selectedId: string | null = null;
  for (const stat of records) {
    if (stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string') {
      selectedId = stat.selectedCandidatePairId;
    }
  }
  let chosen: RtcStat | null = null;
  let nominated: RtcStat | null = null;
  for (const stat of records) {
    if (stat.type !== 'candidate-pair' || stat.state !== 'succeeded') {
      continue;
    }
    if (selectedId !== null && stat.id === selectedId) {
      chosen = stat;
    }
    if ((stat.nominated === true || stat.selected === true) && nominated === null) {
      nominated = stat;
    }
  }
  const pair = chosen ?? nominated;
  let candidateType: string | null = null;
  let protocol: string | null = null;
  const localId = pair?.localCandidateId;
  if (typeof localId === 'string') {
    for (const stat of records) {
      if (stat.id !== localId || stat.type !== 'local-candidate') {
        continue;
      }
      if (typeof stat.candidateType === 'string') {
        candidateType = stat.candidateType;
      }
      if (typeof stat.protocol === 'string') {
        protocol = stat.protocol;
      }
    }
  }
  let rttMs: number | null = null;
  const seconds = pair?.currentRoundTripTime;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) {
    rttMs = Math.round(seconds * 1000);
  }
  return { candidateType, protocol, rttMs };
}

function readOutboundBytes(stats: RTCStatsReport): number | null {
  let bytes: number | null = null;
  stats.forEach((raw) => {
    const stat = asRtcStat(raw);
    if (stat.type !== 'outbound-rtp' || stat.kind !== 'audio' || typeof stat.bytesSent !== 'number') {
      return;
    }
    bytes = (bytes ?? 0) + stat.bytesSent;
  });
  return bytes;
}

/** Тот же гистерезис, что у локального детектора: шкала WebRTC `audioLevel` тоже 0…1. */
const REMOTE_HEAR_ON = 0.022;
const REMOTE_HEAR_OFF = 0.012;
const REMOTE_HEAR_HOLD_MS = 360;

function readInboundAudio(stats: RTCStatsReport): { bytesReceived: number | null; audioLevel: number | null } {
  let bytesReceived: number | null = null;
  let audioLevel: number | null = null;
  stats.forEach((raw) => {
    const stat = asRtcStat(raw);
    if (stat.type !== 'inbound-rtp' || stat.kind !== 'audio') {
      return;
    }
    if (typeof stat.bytesReceived === 'number') {
      bytesReceived = (bytesReceived ?? 0) + stat.bytesReceived;
    }
    if (typeof stat.audioLevel === 'number' && Number.isFinite(stat.audioLevel)) {
      audioLevel = stat.audioLevel;
    }
  });
  return { bytesReceived, audioLevel };
}

/** Уровень всех входящих аудио-потоков из одного отчёта recv-транспорта, по id трека consumer-а. */
function readInboundAudioLevelsByTrack(stats: RTCStatsReport): Map<string, number> {
  const levels = new Map<string, number>();
  stats.forEach((raw) => {
    const stat = asRtcStat(raw);
    if (stat.type !== 'inbound-rtp' || stat.kind !== 'audio' || typeof stat.trackIdentifier !== 'string') {
      return;
    }
    const level = typeof stat.audioLevel === 'number' && Number.isFinite(stat.audioLevel) ? stat.audioLevel : 0;
    levels.set(stat.trackIdentifier, level);
  });
  return levels;
}

async function readTransportRttMs(transport: Transport): Promise<number | null> {
  if (transport.closed || transport.connectionState !== 'connected') {
    return null;
  }
  try {
    return readIceSnapshot(await transport.getStats()).rttMs;
  } catch {
    return null;
  }
}

function transportOpts(
  res: Record<string, unknown>,
): Pick<import('mediasoup-client/types').TransportOptions, 'id' | 'iceParameters' | 'iceCandidates' | 'dtlsParameters'> {
  return {
    id: res.id as string,
    iceParameters: res.ice_parameters as import('mediasoup-client/types').IceParameters,
    iceCandidates: res.ice_candidates as import('mediasoup-client/types').IceCandidate[],
    dtlsParameters: res.dtls_parameters as import('mediasoup-client/types').DtlsParameters,
  };
}

const VOICE_PLAYBACK_ROOT_ID = 'voice-playback-root';

function mountVoicePlaybackAudio(el: HTMLAudioElement): void {
  let root = document.getElementById(VOICE_PLAYBACK_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = VOICE_PLAYBACK_ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText =
      'position:fixed;left:0;bottom:0;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0';
    document.body.appendChild(root);
  }
  root.appendChild(el);
}

async function tryPlayRemoteAudio(el: HTMLAudioElement): Promise<void> {
  try {
    await el.play();
  } catch {
    /* autoplay: ждём unmute трека или жест пользователя */
  }
}

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    throw new Error('no_audio_context');
  }
  return new Ctx();
}

type AudioCtxWithSink = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

async function applyContextSink(ctx: AudioContext, sinkId: string | null): Promise<void> {
  const anyCtx = ctx as AudioCtxWithSink;
  if (typeof anyCtx.setSinkId !== 'function') {
    return;
  }
  try {
    await anyCtx.setSinkId(sinkId && sinkId.length > 0 ? sinkId : '');
  } catch {
    /* Safari / политика / неверный id */
  }
}

type MicGraph = {
  context: AudioContext;
  gain: GainNode;
  source: MediaStreamAudioSourceNode;
  processed: MediaStream;
  /** Пик сырого микрофона до гейта. Ноль — в граф звонка тишина, даже если проверка себя слышит. */
  readInputPeak: () => number;
  stopProcessing: () => void;
};

function closeAudioContext(ctx: AudioContext | null): void {
  if (!ctx || ctx.state === 'closed') {
    return;
  }
  void ctx.close();
}

function releaseStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

/** `true`, когда трек уже отдаёт кадры. Пока `muted`, produce/replaceTrack часто так и не начинают RTP. */
function waitUntilUnmuted(track: MediaStreamTrack, timeoutMs: number): Promise<boolean> {
  if (track.readyState === 'ended') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      track.removeEventListener('unmute', onUnmute);
      track.removeEventListener('ended', onEnded);
      resolve(ok);
    };
    const onUnmute = () => finish(true);
    const onEnded = () => finish(false);
    track.addEventListener('unmute', onUnmute);
    track.addEventListener('ended', onEnded);
    const timer = window.setTimeout(
      () => finish(!track.muted && track.readyState === 'live'),
      timeoutMs,
    );
    if (!track.muted) {
      finish(true);
    } else if (track.readyState === 'ended') {
      finish(false);
    }
  });
}

async function resumeContext(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === 'closed') {
    return false;
  }
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* нет user activation */
    }
  }
  return ctx.state === 'running';
}

function waitUntilContextRunning(ctx: AudioContext, isCurrent: () => boolean): Promise<void> {
  if (!isCurrent() || ctx.state === 'closed') {
    return Promise.reject(new Error('voice_capture_cancelled'));
  }
  if (ctx.state === 'running') {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      unlisten();
      ctx.removeEventListener('statechange', tick);
      window.clearInterval(timer);
      if (ok) {
        resolve();
      } else {
        reject(new Error('voice_capture_cancelled'));
      }
    };
    const tick = () => {
      if (!isCurrent() || ctx.state === 'closed') {
        finish(false);
        return;
      }
      if (ctx.state === 'running') {
        finish(true);
        return;
      }
      void ctx.resume().catch(() => {
        /* следующий жест */
      });
    };
    const unlisten = listenForUserGesture(tick);
    ctx.addEventListener('statechange', tick);
    const timer = window.setInterval(tick, 400);
    tick();
  });
}

/**
 * Контекст со state=running всё равно замирает, если в динамики не подключён
 * живой источник: currentTime стоит, ворклет не считают, гейт остаётся закрытым.
 * Ноль на усилении Chrome выбрасывает, поэтому здесь тихий, но ненулевой тон.
 */
function attachContextKeepAlive(context: AudioContext): () => void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = 1e-5;
  oscillator.frequency.value = 440;
  oscillator.connect(gain);
  gain.connect(context.destination);
  try {
    oscillator.start();
  } catch {
    /* уже запущен */
  }
  return () => {
    try {
      oscillator.stop();
    } catch {
      /* already stopped */
    }
    try {
      oscillator.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      gain.disconnect();
    } catch {
      /* already disconnected */
    }
  };
}

function attachInputProbe(source: AudioNode): { readPeak: () => number; stop: () => void } {
  const analyser = source.context.createAnalyser();
  analyser.fftSize = 512;
  const pull = source.context.createGain();
  pull.gain.value = 1e-5;
  const samples = new Float32Array(analyser.fftSize);
  source.connect(analyser);
  analyser.connect(pull);
  if (source.context instanceof AudioContext) {
    pull.connect(source.context.destination);
  }
  return {
    readPeak() {
      analyser.getFloatTimeDomainData(samples);
      let peak = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const value = Math.abs(samples[i] ?? 0);
        if (value > peak) {
          peak = value;
        }
      }
      return peak;
    },
    stop() {
      try {
        source.disconnect(analyser);
      } catch {
        /* already disconnected */
      }
      try {
        analyser.disconnect();
      } catch {
        /* already disconnected */
      }
      try {
        pull.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}

/**
 * Собирать граф только на уже running контексте.
 * Иначе Chrome подключает источник к suspended AudioContext и трек назначения
 * остаётся muted: produce() принимает его, но RTP так и не идёт.
 */
function assembleMicGraph(
  context: AudioContext,
  raw: MediaStreamTrack,
  onSpeechModel?: (status: 'live' | 'missing') => void,
): MicGraph | null {
  if (context.state !== 'running') {
    return null;
  }
  const stopKeepAlive = attachContextKeepAlive(context);
  const gain = context.createGain();
  gain.gain.value = micInputGain();
  let source: MediaStreamAudioSourceNode;
  try {
    source = context.createMediaStreamSource(new MediaStream([raw]));
  } catch {
    stopKeepAlive();
    return null;
  }
  const dest = context.createMediaStreamDestination();
  let probe = attachInputProbe(source);
  const finish = (stopChain: () => void) => () => {
    stopChain();
    probe.stop();
    stopKeepAlive();
  };
  const readInputPeak = () => probe.readPeak();
  try {
    const chain = connectMicChain(context, source, gain, onSpeechModel);
    chain.output.connect(dest);
    return {
      context,
      gain,
      source,
      processed: dest.stream,
      readInputPeak,
      stopProcessing: finish(chain.stop),
    };
  } catch {
    try {
      source.disconnect();
    } catch {
      /* цепь не собралась */
    }
    probe.stop();
    probe = attachInputProbe(source);
    try {
      source.connect(gain);
      gain.connect(dest);
      return {
        context,
        gain,
        source,
        processed: dest.stream,
        readInputPeak,
        stopProcessing: finish(() => {}),
      };
    } catch {
      try {
        source.disconnect();
      } catch {
        /* уже отключён */
      }
      probe.stop();
      stopKeepAlive();
      return null;
    }
  }
}

/**
 * Первый getUserMedia иногда отдаёт muted-трек и сам не оживает.
 * Повторное открытие — то же, что ручное переключение микрофона в списке.
 */
async function acquireAudibleMic(deviceId: string | null | undefined): Promise<MediaStream> {
  const stream = await acquireMicStream(deviceId);
  const track = stream.getAudioTracks()[0];
  if (!track) {
    return stream;
  }
  if (await waitUntilUnmuted(track, 800)) {
    return stream;
  }
  if (track.readyState !== 'live') {
    return stream;
  }
  releaseStream(stream);
  await new Promise((resolve) => {
    window.setTimeout(resolve, 120);
  });
  const reopened = await acquireMicStream(deviceId);
  const next = reopened.getAudioTracks()[0];
  if (next) {
    await waitUntilUnmuted(next, 800);
  }
  return reopened;
}

function disposeMicGraph(graph: MicGraph | null): void {
  if (!graph) {
    return;
  }
  graph.stopProcessing();
  try {
    graph.source.disconnect();
  } catch {
    /* already disconnected */
  }
  try {
    graph.gain.disconnect();
  } catch {
    /* already disconnected */
  }
  for (const track of graph.processed.getTracks()) {
    track.stop();
  }
  void graph.context.close();
}

type AudioWithSink = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };

function getMediaDevicesOrThrow(): MediaDevices {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!md || typeof md.getUserMedia !== 'function') {
    throw new Error(
      'Нет доступа к микрофону: в небезопасном контексте (http по IP в сети) браузер не предоставляет getUserMedia. Откройте приложение по HTTPS или http://localhost.',
    );
  }
  return md;
}

/** Положение ползунка микрофона. */
function micInputGain(): number {
  return volumeToGain(getInputVolume());
}

/**
 * Явный выбор микрофона: сначала `exact` (иначе Chrome часто оставляет «предыдущий» default при `ideal`),
 * при Overconstrained — fallback на `ideal`.
 */
async function acquireMicStream(deviceId: string | null | undefined): Promise<MediaStream> {
  const md = getMediaDevicesOrThrow();
  const processing = micProcessingConstraints();
  if (!deviceId) {
    return md.getUserMedia({ audio: processing, video: false });
  }
  try {
    return await md.getUserMedia({
      audio: { ...processing, deviceId: { exact: deviceId } },
      video: false,
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return md.getUserMedia({
        audio: { ...processing, deviceId: { ideal: deviceId } },
        video: false,
      });
    }
    throw e;
  }
}

async function applyPlaybackSink(
  el: HTMLAudioElement,
  sinkId: string | null,
): Promise<Exclude<PlaybackSinkState, 'pending'>> {
  const anyEl = el as AudioWithSink;
  if (typeof anyEl.setSinkId !== 'function') {
    return 'unsupported';
  }
  try {
    await anyEl.setSinkId(sinkId ?? '');
    return 'ok';
  } catch {
    return 'fail';
  }
}

/**
 * mediasoup-client трогает RTCPeerConnection при загрузке модуля — динамический import() ниже,
 * после проверки среды (иначе Firefox / не-браузерные контексты дают «RTCPeerConnection is not defined»).
 * Сам файл подключается страницей через import() только при входе в голосовой канал.
 */
export async function startVoiceMediasoup(
  channelId: number,
  options?: VoiceMediasoupOptions,
): Promise<VoiceMediasoupHandle> {
  if (typeof globalThis.RTCPeerConnection === 'undefined') {
    throw new Error(
      'В этом окне нет WebRTC (RTCPeerConnection). В Firefox проверьте, что это не режим с полной изоляцией трекеров; откройте сайт в обычной вкладке или используйте Chrome.',
    );
  }
  getMediaDevicesOrThrow();

  const { Device } = await import('mediasoup-client');
  const device = await Device.factory();

  const caps = await requestVoiceSignal(channelId, 'getRouterCapabilities', {});
  const rawIce = caps.ice_servers as RTCIceServer[] | undefined;
  const iceServers =
    Array.isArray(rawIce) && rawIce.length > 0 ? rawIce : undefined;
  const iceTransportPolicy: RTCIceTransportPolicy | undefined =
    caps.ice_transport_policy === 'relay' ? 'relay' : undefined;
  const transportIceOpts: { iceServers?: RTCIceServer[]; iceTransportPolicy?: RTCIceTransportPolicy } =
    iceTransportPolicy !== undefined ? { iceServers, iceTransportPolicy } : { iceServers };
  await device.load({
    routerRtpCapabilities: caps.rtp_capabilities as RtpCapabilities,
  });

  const sendRes = await requestVoiceSignal(channelId, 'createTransport', { direction: 'send' });
  const sendTransport = device.createSendTransport({
    ...transportOpts(sendRes),
    ...transportIceOpts,
  });

  const recvRes = await requestVoiceSignal(channelId, 'createTransport', { direction: 'recv' });
  const recvTransport = device.createRecvTransport({
    ...transportOpts(recvRes),
    ...transportIceOpts,
  });

  const wireConnect = (t: Transport, direction: 'send' | 'recv') => {
    t.on('connect', ({ dtlsParameters }, callback, errback) => {
      void requestVoiceSignal(channelId, 'connectTransport', {
        direction,
        dtlsParameters,
      })
        .then(() => callback())
        .catch((e: unknown) => errback(e instanceof Error ? e : new Error(String(e))));
    });
  };
  wireConnect(sendTransport, 'send');
  wireConnect(recvTransport, 'recv');

  let localProducer: Producer | null = null;
  let screenVideoProducer: Producer | null = null;
  let screenAudioProducer: Producer | null = null;
  let screenStream: MediaStream | null = null;
  let stoppingScreen = false;
  let screenShareAnnounced = false;
  let screenVideoConsumer: Consumer | null = null;
  let screenAudioConsumer: Consumer | null = null;
  let knownScreen: ScreenProducerSnapshot = { videoId: null, audioId: null, userId: null };
  const screenListeners = new Set<(snapshot: ScreenProducerSnapshot) => void>();

  function emitScreenProducers() {
    const snapshot = { ...knownScreen };
    for (const listener of screenListeners) {
      listener(snapshot);
    }
  }

  function isScreenSource(source: unknown): boolean {
    return source === 'screen-video' || source === 'screen-audio';
  }

  function rememberScreenProducer(producerId: string, userId: number | null, source: string) {
    if (source === 'screen-video') {
      knownScreen = { ...knownScreen, videoId: producerId, userId: userId ?? knownScreen.userId };
    } else if (source === 'screen-audio') {
      knownScreen = { ...knownScreen, audioId: producerId, userId: userId ?? knownScreen.userId };
    } else {
      return;
    }
    emitScreenProducers();
  }

  function forgetScreenProducerId(producerId: string) {
    if (knownScreen.videoId !== producerId && knownScreen.audioId !== producerId) {
      return;
    }
    const videoId = knownScreen.videoId === producerId ? null : knownScreen.videoId;
    const audioId = knownScreen.audioId === producerId ? null : knownScreen.audioId;
    knownScreen = {
      videoId,
      audioId,
      userId: videoId || audioId ? knownScreen.userId : null,
    };
    emitScreenProducers();
    if (screenVideoConsumer?.producerId === producerId) {
      try {
        screenVideoConsumer.close();
      } catch {
        /* ignore */
      }
      screenVideoConsumer = null;
    }
    if (screenAudioConsumer?.producerId === producerId) {
      try {
        screenAudioConsumer.close();
      } catch {
        /* ignore */
      }
      screenAudioConsumer = null;
    }
  }

  sendTransport.on('produce', ({ rtpParameters, appData }, callback, errback) => {
    void requestVoiceSignal(channelId, 'produce', { rtpParameters, appData: appData ?? {} })
      .then((res) => {
        callback({ id: res.id as string });
      })
      .catch((e: unknown) => errback(e instanceof Error ? e : new Error(String(e))));
  });

  /** id consumer → объект (нужен для client-side resume → resumeReceiving в Chrome). */
  const consumers = new Map<string, Consumer>();
  /** producerId → consumer id (для отладки и resume по кнопке). */
  const consumerIdByProducerId = new Map<string, string>();
  const audioEls = new Map<string, HTMLAudioElement>();
  const producerUserIds = new Map<string, number>();
  const consumedProducerIds = new Set<string>();
  const pendingConsume = new Set<string>();
  const consumeRetryAttempts = new Map<string, number>();
  const consumeRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  type RemoteNode = {
    el: HTMLAudioElement;
    source: MediaStreamAudioSourceNode | null;
    gain: GainNode | null;
    limiter: DynamicsCompressorNode | null;
    boostDest: MediaStreamAudioDestinationNode | null;
    /** Заглушённый плеер исходного трека, пока звук идёт через усиление. */
    pump: HTMLAudioElement | null;
    userId: number | null;
    track: MediaStreamTrack;
    sink: PlaybackSinkState;
  };

  const remoteNodes = new Map<string, RemoteNode>();
  let playbackCtx: AudioContext | null = null;
  let micGraph: MicGraph | null = null;
  let localStream: MediaStream | null = null;
  let parkedMicContext: AudioContext | null = null;
  let stopped = false;
  let micEpoch = 0;
  let captureQueue: Promise<void> = Promise.resolve();
  let unbindPlaybackGesture: (() => void) | null = null;
  let listRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubVolume: (() => void) | null = null;
  let unsubSignaling: (() => void) | null = null;
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  let hearingTimer: ReturnType<typeof setInterval> | null = null;
  let hearingSample = false;
  const hearByUser = new Map<number, { hearing: boolean; changedAt: number }>();
  let sampling = false;
  let capturePath: 'graph' | 'raw' | 'none' = 'none';
  let speechModel: 'starting' | 'live' | 'missing' | 'ptt' = 'starting';
  let renderLive: boolean | null = null;
  let playbackDeafened = false;

  const JOURNAL_LIMIT = 40;
  const journal: VoiceIncidentEvent[] = [];
  type FlowSample = { bytes: number; at: number; delta: number | null };
  type RecvFlow = FlowSample & { audioLevel: number | null };
  let sendFlow: FlowSample | null = null;
  const recvFlow = new Map<string, RecvFlow>();
  let sendIce: Omit<IceReportSnapshot, 'connectionState'> = {
    candidateType: null,
    protocol: null,
    rttMs: null,
  };
  let recvIce: Omit<IceReportSnapshot, 'connectionState'> = {
    candidateType: null,
    protocol: null,
    rttMs: null,
  };

  function pushEvent(message: string): void {
    journal.push({ at: Date.now(), message });
    if (journal.length > JOURNAL_LIMIT) {
      journal.shift();
    }
  }

  function setCapturePath(next: 'graph' | 'raw' | 'none'): void {
    if (next === capturePath) {
      return;
    }
    capturePath = next;
    pushEvent(`capture=${next}`);
  }

  function nextFlowSample(prev: FlowSample | null, bytes: number, now: number): FlowSample {
    if (!prev || now - prev.at < 1500) {
      return prev ?? { bytes, at: now, delta: null };
    }
    const delta = bytes - prev.bytes;
    if (delta < 0) {
      return { bytes, at: now, delta: null };
    }
    return { bytes, at: now, delta };
  }

  function assignIce(
    direction: 'send' | 'recv',
    prev: Omit<IceReportSnapshot, 'connectionState'>,
    next: Omit<IceReportSnapshot, 'connectionState'>,
  ): Omit<IceReportSnapshot, 'connectionState'> {
    if (prev.candidateType !== next.candidateType || prev.protocol !== next.protocol) {
      if (
        prev.candidateType !== null ||
        next.candidateType !== null ||
        prev.protocol !== null ||
        next.protocol !== null
      ) {
        pushEvent(`${direction} ice=${next.candidateType ?? 'none'} proto=${next.protocol ?? 'none'}`);
      }
    }
    return next;
  }

  function signalSpeakingFor(userId: number | null): boolean {
    if (userId == null) {
      return false;
    }
    return (
      useVoiceStore.getState().participants.find((participant) => participant.user_id === userId)?.speaking ===
      true
    );
  }

  async function sampleStats(): Promise<void> {
    if (stopped || sampling) {
      return;
    }
    sampling = true;
    try {
      const now = Date.now();
      if (!sendTransport.closed) {
        try {
          sendIce = assignIce('send', sendIce, readIceSnapshot(await sendTransport.getStats()));
        } catch {
          /* транспорт уже закрыт */
        }
      }
      if (!recvTransport.closed) {
        try {
          recvIce = assignIce('recv', recvIce, readIceSnapshot(await recvTransport.getStats()));
        } catch {
          /* транспорт уже закрыт */
        }
      }
      if (localProducer && !localProducer.closed) {
        try {
          const bytes = readOutboundBytes(await localProducer.getStats());
          if (bytes !== null) {
            sendFlow = nextFlowSample(sendFlow, bytes, now);
          }
        } catch {
          /* producer закрыт */
        }
      }
      for (const [producerId, consumerId] of consumerIdByProducerId) {
        const consumer = consumers.get(consumerId);
        if (!consumer || consumer.closed) {
          continue;
        }
        try {
          const inbound = readInboundAudio(await consumer.getStats());
          const prev = recvFlow.get(producerId);
          if (inbound.bytesReceived !== null) {
            const flow = nextFlowSample(prev ?? null, inbound.bytesReceived, Date.now());
            recvFlow.set(producerId, { ...flow, audioLevel: inbound.audioLevel });
          } else if (prev) {
            recvFlow.set(producerId, { ...prev, audioLevel: inbound.audioLevel });
          }
        } catch {
          /* consumer закрыт */
        }
      }
    } finally {
      sampling = false;
    }
  }

  function forgetRemoteHearing(userId: number): void {
    const prev = hearByUser.get(userId);
    if (!prev) {
      return;
    }
    hearByUser.delete(userId);
    if (prev.hearing) {
      options?.onRemoteHearing?.(userId, false);
    }
  }

  function noteRemoteLevel(userId: number, level: number): void {
    const now = Date.now();
    const prev = hearByUser.get(userId) ?? { hearing: false, changedAt: 0 };
    let hearing = prev.hearing;
    if (!prev.hearing && level >= REMOTE_HEAR_ON) {
      hearing = true;
    } else if (prev.hearing && level <= REMOTE_HEAR_OFF && now - prev.changedAt >= REMOTE_HEAR_HOLD_MS) {
      hearing = false;
    }
    if (hearing === prev.hearing) {
      if (!hearByUser.has(userId)) {
        hearByUser.set(userId, prev);
      }
      return;
    }
    hearByUser.set(userId, { hearing, changedAt: now });
    options?.onRemoteHearing?.(userId, hearing);
  }

  async function sampleRemoteHearing(): Promise<void> {
    if (stopped || hearingSample) {
      return;
    }
    hearingSample = true;
    try {
      // Один отчёт PeerConnection на тик вместо getStats() на каждого собеседника: при 7 людях это 10 вызовов/с вместо 70.
      let levelsByTrack: Map<string, number> | null = null;
      if (consumerIdByProducerId.size > 0 && !recvTransport.closed) {
        try {
          levelsByTrack = readInboundAudioLevelsByTrack(await recvTransport.getStats());
        } catch {
          levelsByTrack = null;
        }
        if (stopped) {
          return;
        }
      }
      const seen = new Set<number>();
      for (const [producerId, consumerId] of [...consumerIdByProducerId.entries()]) {
        const userId = producerUserIds.get(producerId);
        if (userId == null) {
          continue;
        }
        const consumer = consumers.get(consumerId);
        if (!consumer || consumer.closed) {
          continue;
        }
        let level = 0;
        const shared = levelsByTrack?.get(consumer.track.id);
        if (shared !== undefined) {
          seen.add(userId);
          noteRemoteLevel(userId, shared);
          continue;
        }
        // Старый Chromium без trackIdentifier в inbound-rtp: отчёт самого consumer-а.
        try {
          const inbound = readInboundAudio(await consumer.getStats());
          if (stopped) {
            return;
          }
          if (!consumers.has(consumerId) || consumer.closed) {
            continue;
          }
          level = inbound.audioLevel ?? 0;
        } catch {
          continue;
        }
        if (stopped) {
          return;
        }
        seen.add(userId);
        noteRemoteLevel(userId, level);
      }
      for (const userId of [...hearByUser.keys()]) {
        if (!seen.has(userId)) {
          forgetRemoteHearing(userId);
        }
      }
    } finally {
      hearingSample = false;
    }
  }

  function userPlaybackGain(userId: number | null): number {
    if (userId == null) {
      return 1;
    }
    return volumeToGain(getUserVolume(userId));
  }

  /** 1 = обычная громкость динамиков и этого участника. Выше 1 — запас ползунка до 200%. */
  function linearPlayback(userId: number | null): number {
    return volumeToGain(getOutputVolume()) * userPlaybackGain(userId);
  }

  function ensurePlaybackContext(): AudioContext | null {
    if (playbackCtx && playbackCtx.state !== 'closed') {
      void playbackCtx.resume();
      return playbackCtx;
    }
    try {
      playbackCtx = createAudioContext();
    } catch {
      playbackCtx = null;
      return null;
    }
    void playbackCtx.resume();
    return playbackCtx;
  }

  function clearPlaybackBoost(node: RemoteNode): void {
    const dest = node.boostDest;
    try {
      node.source?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      node.gain?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      node.limiter?.disconnect();
    } catch {
      /* already disconnected */
    }
    node.source = null;
    node.gain = null;
    node.limiter = null;
    node.boostDest = null;
    if (node.pump) {
      node.pump.pause();
      node.pump.srcObject = null;
      node.pump.remove();
      node.pump = null;
    }
    if (dest) {
      for (const destTrack of dest.stream.getTracks()) {
        destTrack.stop();
      }
    }
  }

  /**
   * До 100% играем исходный WebRTC-трек: так эхоподавление браузера слышит собеседника.
   * Выше 100% `<audio>.volume` обрезается, поэтому усиление идёт через GainNode.
   */
  function syncRemoteLevel(node: RemoteNode): void {
    const level = linearPlayback(node.userId);
    if (!(level > 1)) {
      if (node.gain) {
        clearPlaybackBoost(node);
        node.el.srcObject = new MediaStream([node.track]);
        void tryPlayRemoteAudio(node.el);
      }
      node.el.volume = level;
      return;
    }
    const ctx = ensurePlaybackContext();
    if (!ctx) {
      node.el.volume = 1;
      return;
    }
    if (!node.gain) {
      let source: MediaStreamAudioSourceNode | null = null;
      try {
        source = ctx.createMediaStreamSource(new MediaStream([node.track]));
        const gain = ctx.createGain();
        gain.gain.value = level;
        const limiter = createLimiter(ctx);
        const dest = ctx.createMediaStreamDestination();
        source.connect(gain);
        gain.connect(limiter);
        limiter.connect(dest);
        // Chromium не декодирует удалённый WebRTC-трек для Web Audio, пока его не
        // играет медиаэлемент: без этого плеера усиление выше 100% даёт тишину.
        const pump = document.createElement('audio');
        pump.muted = true;
        pump.autoplay = true;
        pump.setAttribute('playsinline', 'true');
        pump.srcObject = new MediaStream([node.track]);
        mountVoicePlaybackAudio(pump);
        node.pump = pump;
        void tryPlayRemoteAudio(pump);
        node.source = source;
        node.gain = gain;
        node.limiter = limiter;
        node.boostDest = dest;
        node.el.srcObject = dest.stream;
        node.el.volume = 1;
        void tryPlayRemoteAudio(node.el);
      } catch {
        if (source && node.source !== source) {
          try {
            source.disconnect();
          } catch {
            /* граф не собрался */
          }
        }
        clearPlaybackBoost(node);
        node.el.srcObject = new MediaStream([node.track]);
        node.el.volume = 1;
        void tryPlayRemoteAudio(node.el);
      }
      return;
    }
    node.el.volume = 1;
    rampGain(node.gain, level);
  }

  function applyVolumeGains(): void {
    if (micGraph) {
      rampGain(micGraph.gain, micInputGain());
    }
    for (const node of remoteNodes.values()) {
      syncRemoteLevel(node);
    }
  }

  function mountRemoteAudio(producerId: string, track: MediaStreamTrack, userId: number | null): void {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', 'true');
    el.srcObject = new MediaStream([track]);
    mountVoicePlaybackAudio(el);
    const node: RemoteNode = {
      el,
      source: null,
      gain: null,
      limiter: null,
      boostDest: null,
      pump: null,
      userId,
      track,
      sink: 'pending',
    };
    remoteNodes.set(producerId, node);
    audioEls.set(producerId, el);
    syncRemoteLevel(node);
    void tryPlayRemoteAudio(el);
    void applyPlaybackSink(el, activeOutputSinkId).then((result) => {
      const current = remoteNodes.get(producerId);
      if (current && current.el === el) {
        current.sink = result;
      }
    });
  }

  function bindProducerUser(producerId: string, userId: number): void {
    producerUserIds.set(producerId, userId);
    const node = remoteNodes.get(producerId);
    if (!node || node.userId === userId) {
      return;
    }
    node.userId = userId;
    applyVolumeGains();
  }

  function releaseRemoteAudio(producerId: string): void {
    const node = remoteNodes.get(producerId);
    if (!node) {
      return;
    }
    clearPlaybackBoost(node);
    node.el.srcObject = null;
    node.el.remove();
    remoteNodes.delete(producerId);
    audioEls.delete(producerId);
    recvFlow.delete(producerId);
  }

  function disposePlayback(): void {
    for (const producerId of [...remoteNodes.keys()]) {
      releaseRemoteAudio(producerId);
    }
    const ctx = playbackCtx;
    playbackCtx = null;
    if (ctx) {
      void ctx.close();
    }
  }

  function clearConsumeRetry(producerId: string) {
    const t = consumeRetryTimers.get(producerId);
    if (t) {
      clearTimeout(t);
      consumeRetryTimers.delete(producerId);
    }
    consumeRetryAttempts.delete(producerId);
  }

  function isRetryableConsumeError(e: unknown): boolean {
    const m = e instanceof Error ? e.message : String(e);
    return /CANNOT_CONSUME|NO_RECV_TRANSPORT|voice_signal_timeout|voice_signal_offline|MEDIASOUP_ERROR/i.test(m);
  }

  function scheduleConsumeRetry(producerId: string, e: unknown) {
    if (stopped || !isRetryableConsumeError(e)) {
      return;
    }
    if (consumedProducerIds.has(producerId)) {
      return;
    }
    if (consumeRetryTimers.has(producerId)) {
      return;
    }
    const next = (consumeRetryAttempts.get(producerId) ?? 0) + 1;
    if (next > 8) {
      console.warn('[voice] consume retry limit reached', producerId);
      return;
    }
    consumeRetryAttempts.set(producerId, next);
    const delayMs = Math.min(2000, 200 * next);
    const timer = setTimeout(() => {
      consumeRetryTimers.delete(producerId);
      void consumeProducer(producerId).catch((retryErr) => {
        console.error('[voice] consume retry failed', producerId, retryErr);
        scheduleConsumeRetry(producerId, retryErr);
      });
    }, delayMs);
    consumeRetryTimers.set(producerId, timer);
  }

  async function syncProducersList() {
    const list = await requestVoiceSignal(channelId, 'listProducers', {});
    const producers = list.producers as
      | { producer_id: string; user_id: number; source?: string }[]
      | undefined;
    if (!Array.isArray(producers)) {
      return;
    }
    let videoId: string | null = null;
    let audioId: string | null = null;
    let screenUserId: number | null = null;
    for (const row of producers) {
      if (row.source === 'screen-video') {
        videoId = row.producer_id;
        screenUserId = row.user_id;
        continue;
      }
      if (row.source === 'screen-audio') {
        audioId = row.producer_id;
        screenUserId = screenUserId ?? row.user_id;
        continue;
      }
      if (typeof row.user_id === 'number') {
        bindProducerUser(row.producer_id, row.user_id);
      }
      try {
        await consumeProducer(row.producer_id);
      } catch (e) {
        console.error('[voice] sync list consume', row.producer_id, e);
        scheduleConsumeRetry(row.producer_id, e);
      }
    }
    knownScreen = { videoId, audioId, userId: screenUserId };
    emitScreenProducers();
  }

  async function consumeProducer(producerId: string) {
    if (consumedProducerIds.has(producerId) || pendingConsume.has(producerId)) {
      return;
    }
    if (localProducer?.id === producerId) {
      return;
    }
    pendingConsume.add(producerId);
    try {
      const rtpCapabilities = JSON.parse(JSON.stringify(device.rtpCapabilities)) as RtpCapabilities;
      const res = await requestVoiceSignal(channelId, 'consume', {
        producerId,
        rtpCapabilities,
      });
      if (stopped) {
        return;
      }
      const consumer = await recvTransport.consume({
        id: res.id as string,
        producerId: res.producer_id as string,
        kind: 'audio',
        rtpParameters: res.rtp_parameters as RtpParameters,
      });
      if (stopped) {
        consumer.close();
        return;
      }
      clearConsumeRetry(producerId);
      consumers.set(consumer.id, consumer);
      consumerIdByProducerId.set(producerId, consumer.id);
      try {
        await requestVoiceSignal(channelId, 'resumeConsumer', { consumerId: consumer.id });
      } catch {
        /* worker уже в resumed */
      }
      if (stopped) {
        // teardown уже очистил consumers: этот закрываем сами, иначе <audio> останется в DOM.
        consumers.delete(consumer.id);
        consumer.close();
        return;
      }
      consumer.resume();
      const track = consumer.track;
      track.enabled = !playbackDeafened;
      mountRemoteAudio(producerId, track, producerUserIds.get(producerId) ?? null);
      const bumpPlay = () => {
        if (playbackCtx?.state === 'suspended') {
          void playbackCtx.resume();
        }
        const el = remoteNodes.get(producerId)?.el;
        if (el) {
          void tryPlayRemoteAudio(el);
        }
      };
      track.addEventListener('unmute', () => {
        pushEvent(`remote unmute producer=${producerId}`);
        bumpPlay();
      });
      bumpPlay();
      consumedProducerIds.add(producerId);
      pushEvent(`consume ok producer=${producerId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      pushEvent(`consume fail producer=${producerId} ${message}`);
      console.error('[voice] consumeProducer', producerId, e);
      throw e;
    } finally {
      pendingConsume.delete(producerId);
    }
  }

  const unsubNew = subscribeRealtime((ev, data) => {
    if (ev !== 'voice:new_producer') {
      return;
    }
    if (data.channel_id !== channelId) {
      return;
    }
    const pid = data.producer_id;
    if (typeof pid !== 'string') {
      return;
    }
    if (typeof data.user_id === 'number') {
      bindProducerUser(pid, data.user_id);
    }
    if (isScreenSource(data.source)) {
      rememberScreenProducer(pid, typeof data.user_id === 'number' ? data.user_id : null, String(data.source));
      return;
    }
    void consumeProducer(pid).catch((e) => {
      console.error('[voice] voice:new_producer consume', pid, e);
      scheduleConsumeRetry(pid, e);
    });
  });

  const unsubUserJoined = subscribeRealtime((ev, data) => {
    if (ev !== 'voice:user_joined') {
      return;
    }
    if (data.channel_id !== channelId) {
      return;
    }
    void syncProducersList().catch((e) => {
      console.error('[voice] sync on user_joined', e);
    });
  });

  let activeOutputSinkId = options?.outputDeviceId ?? null;

  const unsubClosed = subscribeRealtime((ev, data) => {
    if (ev !== 'voice:producer_closed') {
      return;
    }
    if (data.channel_id !== channelId) {
      return;
    }
    const pid = data.producer_id;
    if (typeof pid !== 'string') {
      return;
    }
    // Сервер закрыл нашу трансляцию (роль больше не разрешает) — остановить захват и UI.
    if (pid === screenVideoProducer?.id) {
      void stopScreenShare();
      return;
    }
    forgetScreenProducerId(pid);
    const heardUser = producerUserIds.get(pid);
    if (heardUser !== undefined) {
      forgetRemoteHearing(heardUser);
    }
    releaseRemoteAudio(pid);
    producerUserIds.delete(pid);
    consumedProducerIds.delete(pid);
    consumerIdByProducerId.delete(pid);
    clearConsumeRetry(pid);
    for (const [consId, c] of consumers) {
      if (c.producerId === pid) {
        c.close();
        consumers.delete(consId);
        break;
      }
    }
  });

  let uiMuted = false;
  let checkHeld = false;
  let detectorSpeaking = false;
  let publishedSpeaking = false;
  const publishSpeaking = () => {
    const transmitting = isPushToTalkActive() && isPttHeld() && !uiMuted && !checkHeld;
    const next = isPushToTalkActive() ? transmitting : detectorSpeaking;
    if (next === publishedSpeaking) {
      return;
    }
    publishedSpeaking = next;
    sendVoiceSpeaking(next);
    options?.onSpeaking?.(next);
  };
  const speakingWatch = createSpeakingDetector({
    onChange: (speaking) => {
      detectorSpeaking = speaking;
      publishSpeaking();
    },
  });
  const unsubPttSpeaking = subscribePttHeld(publishSpeaking);
  // Тон рации играет только локально; stop — только если был start, чтобы пара не рвалась.
  let pttToneOn = false;
  const unsubPttTone = subscribePttHeld(() => {
    if (isPttHeld()) {
      if (!pttToneOn && isPushToTalkActive() && !uiMuted && !checkHeld) {
        pttToneOn = true;
        playPttStartSound();
      }
      return;
    }
    if (pttToneOn) {
      pttToneOn = false;
      playPttStopSound();
    }
  });
  const unsubActivationSpeaking = subscribeVoiceActivation(publishSpeaking);
  publishSpeaking();
  const syncMicSend = () => {
    const silent = uiMuted || checkHeld;
    speakingWatch.setMuted(silent);
    publishSpeaking();
    if (silent) {
      void localProducer?.pause();
    } else {
      void localProducer?.resume();
    }
  };

  const teardown = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    micEpoch += 1;
    void stopScreenShare();
    stopWatchingScreenShare();
    unbindPlaybackGesture?.();
    unbindPlaybackGesture = null;
    unsubVolume?.();
    unsubVolume = null;
    unsubPttSpeaking();
    unsubPttTone();
    unsubActivationSpeaking();
    speakingWatch.stop();
    if (listRetryTimer !== null) {
      clearTimeout(listRetryTimer);
      listRetryTimer = null;
    }
    unsubNew();
    unsubUserJoined();
    unsubClosed();
    unsubSignaling?.();
    unsubSignaling = null;
    if (statsTimer !== null) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
    if (hearingTimer !== null) {
      clearInterval(hearingTimer);
      hearingTimer = null;
    }
    for (const userId of [...hearByUser.keys()]) {
      forgetRemoteHearing(userId);
    }
    for (const t of consumeRetryTimers.values()) {
      clearTimeout(t);
    }
    consumeRetryTimers.clear();
    consumeRetryAttempts.clear();
    for (const c of consumers.values()) {
      try {
        c.close();
      } catch {
        /* ignore */
      }
    }
    consumers.clear();
    consumerIdByProducerId.clear();
    disposePlayback();
    try {
      localProducer?.close();
    } catch {
      /* ignore */
    }
    localProducer = null;
    disposeMicGraph(micGraph);
    micGraph = null;
    closeAudioContext(parkedMicContext);
    parkedMicContext = null;
    releaseStream(localStream);
    localStream = null;
    try {
      sendTransport.close();
    } catch {
      /* ignore */
    }
    try {
      recvTransport.close();
    } catch {
      /* ignore */
    }
  };

  function noteSpeechModel(epoch: number, status: 'live' | 'missing'): void {
    if (epoch !== micEpoch || speechModel === status) {
      return;
    }
    speechModel = status;
    pushEvent(`vad=${status}`);
  }

  function armCaptureClock(graph: MicGraph, epoch: number): void {
    const started = graph.context.currentTime;
    const wall = performance.now();
    window.setTimeout(() => {
      if (epoch !== micEpoch || stopped || micGraph !== graph || graph.context.state === 'closed') {
        return;
      }
      const advanced = graph.context.currentTime - started;
      const elapsed = (performance.now() - wall) / 1000;
      if (advanced >= Math.min(0.4, elapsed * 0.4)) {
        if (renderLive === false) {
          pushEvent('capture render=yes');
        }
        renderLive = true;
        return;
      }
      renderLive = false;
      pushEvent('capture render=no');
    }, 1200);
  }

  async function upgradeWhenResumed(ctx: AudioContext, raw: MediaStreamTrack, epoch: number): Promise<void> {
    const isCurrent = () => epoch === micEpoch && !stopped && raw.readyState === 'live';
    parkedMicContext = ctx;
    try {
      await waitUntilContextRunning(ctx, isCurrent);
    } catch {
      if (parkedMicContext === ctx) {
        parkedMicContext = null;
      }
      closeAudioContext(ctx);
      return;
    }
    if (parkedMicContext === ctx) {
      parkedMicContext = null;
    }
    if (!isCurrent() || !localProducer || localProducer.closed) {
      closeAudioContext(ctx);
      return;
    }
    const graph = assembleMicGraph(ctx, raw, (status) => noteSpeechModel(epoch, status));
    const processed = graph?.processed.getAudioTracks()[0];
    if (!graph || !processed || !isCurrent() || !localProducer || localProducer.closed) {
      disposeMicGraph(graph);
      if (!graph) {
        closeAudioContext(ctx);
      }
      return;
    }
    try {
      await localProducer.replaceTrack({ track: processed });
    } catch (error) {
      disposeMicGraph(graph);
      if (!stopped) {
        console.error('[voice] processed mic replace', error);
      }
      return;
    }
    if (!isCurrent()) {
      disposeMicGraph(graph);
      return;
    }
    const previous = micGraph;
    micGraph = graph;
    setCapturePath('graph');
    speakingWatch.attach(graph.gain);
    armCaptureClock(graph, epoch);
    syncMicSend();
    if (previous && previous !== graph) {
      disposeMicGraph(previous);
    }
  }

  async function captureAndPublish(deviceId: string | null | undefined, epoch: number): Promise<void> {
    const isCurrent = () => epoch === micEpoch && !stopped;
    speechModel = isPushToTalkActive() ? 'ptt' : 'starting';
    const stream = await acquireAudibleMic(deviceId);
    const raw = stream.getAudioTracks()[0];
    if (!raw || raw.readyState !== 'live') {
      releaseStream(stream);
      throw new Error('no_audio_track');
    }
    if (!isCurrent()) {
      releaseStream(stream);
      return;
    }

    const ctx = takePrimedVoiceAudioContext() ?? createAudioContext();
    const running = await resumeContext(ctx);
    if (!isCurrent()) {
      releaseStream(stream);
      closeAudioContext(ctx);
      return;
    }

    let graph: MicGraph | null = null;
    let sendTrack: MediaStreamTrack = raw;
    if (running) {
      graph = assembleMicGraph(ctx, raw, (status) => noteSpeechModel(epoch, status));
      const processed = graph?.processed.getAudioTracks()[0];
      if (graph && processed && isCurrent()) {
        sendTrack = processed;
      } else {
        disposeMicGraph(graph);
        graph = null;
        if (!isCurrent()) {
          releaseStream(stream);
          return;
        }
      }
    } else {
      console.warn('[voice] AudioContext is suspended; sending the raw microphone until the next click');
    }

    if (raw.readyState !== 'live' || sendTrack.readyState !== 'live') {
      disposeMicGraph(graph);
      releaseStream(stream);
      if (!graph) {
        closeAudioContext(ctx);
      }
      throw new Error('no_audio_track');
    }

    try {
      if (!localProducer || localProducer.closed) {
        localProducer = await sendTransport.produce({ track: sendTrack });
        if (localProducer.paused) {
          localProducer.resume();
        }
      } else {
        await localProducer.replaceTrack({ track: sendTrack });
      }
    } catch (error) {
      disposeMicGraph(graph);
      releaseStream(stream);
      if (!graph) {
        closeAudioContext(ctx);
      }
      if (stopped || sendTransport.closed) {
        return;
      }
      throw error;
    }

    if (!isCurrent()) {
      disposeMicGraph(graph);
      releaseStream(stream);
      if (!graph) {
        closeAudioContext(ctx);
      }
      return;
    }

    const previousStream = localStream;
    const previousGraph = micGraph;
    localStream = stream;
    micGraph = graph;
    setCapturePath(graph ? 'graph' : 'raw');
    if (graph) {
      speakingWatch.attach(graph.gain);
      armCaptureClock(graph, epoch);
    }
    syncMicSend();
    if (previousGraph && previousGraph !== graph) {
      disposeMicGraph(previousGraph);
    }
    if (previousStream && previousStream !== stream) {
      releaseStream(previousStream);
    }

    if (sendTrack.muted) {
      pushEvent('local track muted');
      sendTrack.addEventListener(
        'unmute',
        () => {
          if (epoch !== micEpoch || stopped) {
            return;
          }
          pushEvent('local track unmute');
          // Тот же объект трека повторно в replaceTrack не подхватывается.
          // Новое открытие устройства — как ручное переключение микрофона.
          void enqueueCapture(deviceId);
        },
        { once: true },
      );
    }

    if (!graph && ctx.state !== 'closed' && ctx.state !== 'running') {
      void upgradeWhenResumed(ctx, raw, epoch);
    } else if (!graph && ctx.state === 'running') {
      closeAudioContext(ctx);
    }
  }

  function enqueueCapture(deviceId: string | null | undefined): Promise<void> {
    const epoch = ++micEpoch;
    const job = captureQueue.then(() => captureAndPublish(deviceId, epoch));
    captureQueue = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  }

  unbindPlaybackGesture = listenForUserGesture(() => {
    if (playbackCtx?.state === 'suspended') {
      void playbackCtx.resume();
    }
    for (const node of remoteNodes.values()) {
      void tryPlayRemoteAudio(node.el);
      if (node.pump) {
        void tryPlayRemoteAudio(node.pump);
      }
    }
  });
  unsubVolume = subscribeVoiceVolume(applyVolumeGains);
  sendTransport.on('connectionstatechange', (state) => {
    pushEvent(`send connection=${state}`);
  });
  recvTransport.on('connectionstatechange', (state) => {
    pushEvent(`recv connection=${state}`);
  });
  unsubSignaling = subscribeRealtime((ev, data) => {
    if (ev !== 'connection:status') {
      return;
    }
    const state = typeof data.state === 'string' ? data.state : 'unknown';
    pushEvent(`ws ${state}`);
  });
  statsTimer = setInterval(() => {
    void sampleStats();
  }, 2000);
  void sampleStats();
  hearingTimer = setInterval(() => {
    void sampleRemoteHearing();
  }, 100);
  void sampleRemoteHearing();

  try {
    // Сначала чужие треки и <audio>: эхоподавление Chrome часто глушит микрофон,
    // открытый до появления воспроизведения. Смена устройства ввода это лечит —
    // она заново открывает микрофон, когда элементы уже в DOM.
    await syncProducersList();
    for (const node of remoteNodes.values()) {
      void tryPlayRemoteAudio(node.el);
    }
    await enqueueCapture(options?.inputDeviceId ?? null);
  } catch (error) {
    teardown();
    throw error;
  }

  async function closePublishedProducer(producer: Producer | null) {
    if (!producer || producer.closed) {
      return;
    }
    const producerId = producer.id;
    try {
      producer.close();
    } catch {
      /* ignore */
    }
    try {
      await requestVoiceSignal(channelId, 'closeProducer', { producerId });
    } catch (error) {
      console.warn('[voice] closeProducer', producerId, error);
    }
  }

  async function stopScreenShare() {
    if (stoppingScreen) {
      return;
    }
    stoppingScreen = true;
    const video = screenVideoProducer;
    const audio = screenAudioProducer;
    const stream = screenStream;
    const hadShare = video != null || audio != null || stream != null;
    const announced = screenShareAnnounced;
    screenShareAnnounced = false;
    screenVideoProducer = null;
    screenAudioProducer = null;
    screenStream = null;
    try {
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
      await closePublishedProducer(video);
      await closePublishedProducer(audio);
    } finally {
      stoppingScreen = false;
    }
    if (hadShare) {
      useScreenShareStore.getState().setHosting(null);
    }
    if (hadShare && announced) {
      playStreamStopSound();
    }
  }

  /** Отдать захват следующему handle (переподключение к той же комнате): producer'ы закрываем, дорожки — нет. */
  function detachScreenShare(): MediaStream | null {
    const stream = screenStream;
    if (!stream) {
      return null;
    }
    const video = screenVideoProducer;
    const audio = screenAudioProducer;
    screenStream = null;
    screenVideoProducer = null;
    screenAudioProducer = null;
    screenShareAnnounced = false;
    void closePublishedProducer(video);
    void closePublishedProducer(audio);
    return stream;
  }

  async function publishScreenShare(
    stream: MediaStream,
    profile: { maxBitrate: number; maxFramerate: number },
    options?: { silent?: boolean },
  ) {
    if (!device.canProduce('video')) {
      throw new Error('SCREEN_CODEC_UNAVAILABLE');
    }
    await stopScreenShare();
    const video = stream.getVideoTracks()[0];
    if (!video) {
      throw new Error('NO_VIDEO_TRACK');
    }
    screenStream = stream;
    const onEnded = () => {
      // Дорожка могла перейти к новому handle после переподключения — тогда это уже не наш показ.
      if (screenStream === stream) {
        void stopScreenShare();
      }
    };
    video.addEventListener('ended', onEnded);
    try {
      screenVideoProducer = await sendTransport.produce({
        track: video,
        encodings: [{ maxBitrate: profile.maxBitrate, maxFramerate: profile.maxFramerate }],
        codecOptions: { videoGoogleStartBitrate: 1000 },
        appData: { source: 'screen-video' },
      });
      const audio = stream.getAudioTracks()[0] ?? null;
      if (audio) {
        audio.addEventListener('ended', onEnded);
        try {
          screenAudioProducer = await sendTransport.produce({
            track: audio,
            appData: { source: 'screen-audio' },
          });
        } catch (error) {
          audio.stop();
          console.error('[voice] screen audio produce', error);
        }
      }
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      screenStream = null;
      await stopScreenShare();
      throw error;
    }
    screenShareAnnounced = true;
    if (!options?.silent) {
      playStreamStartSound();
    }
  }

  function stopWatchingScreenShare() {
    const hadVideo = screenVideoConsumer != null;
    const shareLive = knownScreen.videoId != null;
    try {
      screenVideoConsumer?.close();
    } catch {
      /* ignore */
    }
    try {
      screenAudioConsumer?.close();
    } catch {
      /* ignore */
    }
    screenVideoConsumer = null;
    screenAudioConsumer = null;
    if (hadVideo && shareLive) {
      playStreamLeftSound();
    }
    if (hadVideo) {
      void requestVoiceSignal(channelId, 'unwatchScreen', {}).catch(() => {
        /* комната уже закрыта */
      });
    }
  }

  async function consumeScreenProducer(producerId: string): Promise<Consumer> {
    const rtpCapabilities = JSON.parse(JSON.stringify(device.rtpCapabilities)) as RtpCapabilities;
    const res = await requestVoiceSignal(channelId, 'consume', {
      producerId,
      rtpCapabilities,
    });
    const kind = res.kind === 'video' ? 'video' : 'audio';
    const consumer = await recvTransport.consume({
      id: res.id as string,
      producerId: res.producer_id as string,
      kind,
      rtpParameters: res.rtp_parameters as RtpParameters,
    });
    try {
      await requestVoiceSignal(channelId, 'resumeConsumer', { consumerId: consumer.id });
    } catch {
      /* worker уже в resumed */
    }
    consumer.resume();
    return consumer;
  }

  async function watchScreenShare() {
    await syncProducersList();
    const videoId = knownScreen.videoId;
    if (!videoId) {
      throw new Error('NO_SCREEN_SHARE');
    }
    stopWatchingScreenShare();
    screenVideoConsumer = await consumeScreenProducer(videoId);
    playStreamJoinedSound();
    let audio: MediaStreamTrack | null = null;
    const audioId = knownScreen.audioId;
    if (audioId) {
      try {
        screenAudioConsumer = await consumeScreenProducer(audioId);
        audio = screenAudioConsumer.track;
      } catch (error) {
        console.error('[voice] screen audio consume', error);
        screenAudioConsumer = null;
      }
    }
    return { video: screenVideoConsumer.track, audio };
  }

  listRetryTimer = setTimeout(() => {
    listRetryTimer = null;
    void (async () => {
      try {
        await syncProducersList();
      } catch (e) {
        console.error('[voice] listProducers retry', e);
      }
    })();
  }, 500);

  return {
    stop: () => {
      teardown();
    },
    setMicMuted: (muted: boolean) => {
      uiMuted = muted;
      syncMicSend();
    },
    setMicCheckHold: (held: boolean) => {
      checkHeld = held;
      syncMicSend();
    },
    setDeafened: (deafened: boolean) => {
      playbackDeafened = deafened;
      for (const c of consumers.values()) {
        c.track.enabled = !deafened;
      }
    },
    getMediaDebug: (): VoiceMediaDebug => {
      const remote: VoiceMediaDebug['remote'] = [];
      const mic = localStream?.getAudioTracks()[0];
      for (const [producerKey, node] of remoteNodes) {
        const t = node.track;
        const cid = consumerIdByProducerId.get(producerKey);
        const cons = cid ? consumers.get(cid) : undefined;
        const flow = recvFlow.get(producerKey);
        remote.push({
          producerId: producerKey,
          consumerPaused: cons?.paused ?? false,
          trackMuted: t.muted,
          trackReady: t.readyState,
          bytesReceived2s: flow?.delta ?? null,
          audioLevel: flow?.audioLevel ?? null,
          signalSpeaking: signalSpeakingFor(node.userId),
        });
      }
      return {
        sendConn: sendTransport.connectionState,
        recvConn: recvTransport.connectionState,
        sendIce: sendIce.candidateType,
        recvIce: recvIce.candidateType,
        bytesSent2s: sendFlow?.delta ?? null,
        localMicMuted: mic?.muted ?? true,
        localMicReady: mic?.readyState ?? 'none',
        localProducerPaused: localProducer?.paused ?? false,
        localProducerId: localProducer?.id ?? null,
        remote,
        audioPaused: [...remoteNodes.values()].map((node) => node.el.paused),
      };
    },
    getIncidentReport: () => {
      const mic = localStream?.getAudioTracks()[0];
      const version = window.hoobaDesktop?.version?.trim();
      return formatVoiceIncidentReport({
        timeIso: new Date().toISOString(),
        clientVersion: version ? version : 'web',
        userId: useUserStore.getState().me?.id ?? null,
        channelId,
        ws: getSignalingDebug(),
        send: { connectionState: sendTransport.connectionState, ...sendIce },
        recv: { connectionState: recvTransport.connectionState, ...recvIce },
        outbound: {
          producerId: localProducer?.id ?? null,
          paused: localProducer?.paused ?? false,
          trackMuted: mic?.muted ?? true,
          audioContextState: micGraph?.context.state ?? parkedMicContext?.state ?? 'none',
          capturePath,
          speechModel,
          renderLive,
          inputPeak: micGraph?.readInputPeak() ?? null,
          bytesSent2s: sendFlow?.delta ?? null,
        },
        playback: {
          outputVolume: getOutputVolume(),
          deafened: playbackDeafened,
          playbackContextState: playbackCtx?.state ?? 'none',
        },
        remotes: [...remoteNodes.entries()].map(([producerId, node]) => {
          const cid = consumerIdByProducerId.get(producerId);
          const cons = cid ? consumers.get(cid) : undefined;
          const flow = recvFlow.get(producerId);
          return {
            userId: node.userId,
            producerId,
            consumerPaused: cons?.paused ?? false,
            trackMuted: node.track.muted,
            trackEnabled: node.track.enabled,
            bytesReceived2s: flow?.delta ?? null,
            audioLevel: flow?.audioLevel ?? null,
            signalSpeaking: signalSpeakingFor(node.userId),
            audioPaused: node.el.paused,
            userVolume: node.userId == null ? 100 : getUserVolume(node.userId),
            sink: node.sink,
          };
        }),
        events: journal.slice(),
      });
    },
    replaceInputDevice: async (deviceId) => {
      primeVoiceAudioFromUserGesture();
      if (!localProducer || localProducer.closed) {
        throw new Error('no_local_producer');
      }
      await enqueueCapture(deviceId);
    },
    setOutputDevice: async (deviceId) => {
      activeOutputSinkId = deviceId;
      if (playbackCtx) {
        await applyContextSink(playbackCtx, deviceId);
      }
      for (const [producerId, el] of audioEls) {
        const result = await applyPlaybackSink(el, deviceId);
        const node = remoteNodes.get(producerId);
        if (node && node.el === el) {
          node.sink = result;
        }
      }
    },
    measurePingMs: async () => {
      const send = await readTransportRttMs(sendTransport);
      if (send != null) {
        return send;
      }
      return readTransportRttMs(recvTransport);
    },
    canPublishScreen: () => device.loaded && device.canProduce('video'),
    publishScreenShare,
    stopScreenShare,
    detachScreenShare,
    getScreenShareStream: () => screenStream,
    setScreenAudioEnabled: (enabled) => {
      for (const track of screenStream?.getAudioTracks() ?? []) {
        track.enabled = enabled;
      }
    },
    watchScreenShare,
    stopWatchingScreenShare,
    subscribeScreenProducers: (listener) => {
      screenListeners.add(listener);
      listener({ ...knownScreen });
      return () => {
        screenListeners.delete(listener);
      };
    },
  };
}

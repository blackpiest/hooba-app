import type { WebSocket } from 'ws';
import { createWorker } from 'mediasoup';
import type {
  Consumer,
  DtlsParameters,
  Producer,
  RtpCapabilities,
  RtpParameters,
  Router,
  WebRtcServer,
  WebRtcTransport,
  Worker,
} from 'mediasoup/types';
import { sendWsEnvelope } from '../realtime/ws-envelope.js';
import type { Env } from '../../config/env.js';
import { singleFlight, forgetSingleFlight } from './single-flight.js';
import { transportPortRange } from './rtc-ports.js';
import { remoteListenAddress } from './listen-address.js';
import {
  claimScreenShare,
  clearScreenShareSlots,
  deleteScreenSlot,
  getScreenSlot,
  releaseUnboundScreenClaim,
  setScreenSlot,
} from './screen-share-slot.js';
import { getChannelPermissions } from '../../core/permissions/permissions.js';
import type { VoicePauseScope } from './voice-media-bridge.js';
import { iceServersForVoiceClient, type IceServer } from './turn-credentials.js';
import { isAudioSourceBlockedByServerMute, mediasoupSignalFailure } from './voice-signal-error.js';
import {
  broadcastVoiceRoom,
  clearAllChannelScreenShares,
  evictAllVoiceUsers,
  getSocketVoiceChannelId,
  getVoiceParticipantUsername,
  getVoiceUserIdForSocket,
  isVoiceMicBlocked,
  isVoiceServerMuted,
  setChannelScreenShare,
} from './voice-registry.js';
import { getRememberedWsClientIp } from './ws-client-ip.js';

/** Только вариант из mediasoup `supportedRtpCapabilities` для audio/opus (там один — stereo). */
const AUDIO_CODECS = [
  {
    kind: 'audio' as const,
    mimeType: 'audio/opus',
    clockRate: 48_000,
    channels: 2,
  },
];

const VIDEO_CODECS = [
  {
    kind: 'video' as const,
    mimeType: 'video/VP8',
    clockRate: 90_000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
    rtcpFeedback: [
      { type: 'nack' },
      { type: 'nack', parameter: 'pli' },
      { type: 'ccm', parameter: 'fir' },
      { type: 'goog-remb' },
    ],
  },
];

const MEDIA_CODECS = [...AUDIO_CODECS, ...VIDEO_CODECS];

type ProducerSource = 'microphone' | 'screen-video' | 'screen-audio';

type ProducerMeta = {
  userId: number;
  source: ProducerSource;
};

type PeerMedia = {
  channelId: number;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producer?: Producer;
  screenVideo?: Producer;
  screenAudio?: Producer;
  consumers: Map<string, Consumer>;
};

/**
 * Потолок consumer'ов на один сокет. В комнате 8 человек: 7 микрофонов и одна демонстрация
 * (видео + звук) — 9. Запас на переподписку, но без бесконечного размножения потоков.
 */
const MAX_CONSUMERS_PER_PEER = 32;
/** Входящий битрейт send-транспорта: демонстрация до 1,5 Мбит/с + микрофон + звук экрана. */
const SEND_MAX_INCOMING_BITRATE = 3_000_000;
const WORKER_RESTART_MAX_DELAY_MS = 30_000;

let worker: Worker | null = null;
let workerEnv: Env | null = null;
let workerShuttingDown = false;
let workerRestartTimer: ReturnType<typeof setTimeout> | null = null;
let workerRestartAttempts = 0;
/** Общий порт для не-loopback клиентов (MEDIASOUP_WEBRTC_PORT). Закрывается вместе с worker. */
let webRtcServer: WebRtcServer | null = null;
const routers = new Map<number, Router>();
const routerEpoch = new Map<number, number>();
const peers = new Map<WebSocket, PeerMedia>();
/** channelId → producerId → кто и что публикует */
const producersByChannel = new Map<number, Map<string, ProducerMeta>>();
/** channelId → кто смотрит screen-video. Ведущий сюда не входит. */
const screenViewersByChannel = new Map<number, Set<number>>();

function defaultIceServers(): IceServer[] {
  return [];
}

function parseIceServersJson(raw: string | undefined): IceServer[] {
  if (!raw?.trim()) {
    return defaultIceServers();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultIceServers();
    }
    return parsed as IceServer[];
  } catch {
    return defaultIceServers();
  }
}

let iceServersCache: IceServer[] = defaultIceServers();
let turnAuthSecret: string | undefined;

function iceServersJsonContainsTurn(servers: IceServer[]): boolean {
  for (const s of servers) {
    const u = s.urls;
    const arr = Array.isArray(u) ? u : [u];
    for (const url of arr) {
      if (typeof url === 'string' && /^(turn|turns):/i.test(url.trim())) {
        return true;
      }
    }
  }
  return false;
}

function warnProductionVoiceIce(env: Env): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  if (iceServersCache.length === 0) {
    console.warn(
      '[voice] RTC_ICE_SERVERS_JSON пуст: клиент не получит STUN/TURN с сервера. За NAT/SNAT голос часто не поднимется. См. docs/COTURN_DEPLOYMENT_V1.md, infra/docker/env.prod.example.',
    );
    return;
  }
  if (!iceServersJsonContainsTurn(iceServersCache)) {
    console.warn(
      '[voice] В RTC_ICE_SERVERS_JSON нет URL с префиксом turn:/turns: — только STUN не покрывает симметричный NAT и жёсткие сети. См. docs/COTURN_DEPLOYMENT_V1.md §1, §13.',
    );
  }
}

/**
 * Пытается поднять mediasoup worker. На Windows без собранного бинарника (pnpm postinstall)
 * вернёт `false` — API и текст при этом должны работать без SFU.
 */
export async function startMediasoupVoiceWorker(env: Env): Promise<boolean> {
  iceServersCache = parseIceServersJson(env.RTC_ICE_SERVERS_JSON);
  turnAuthSecret = env.TURN_AUTH_SECRET;
  workerEnv = env;
  workerShuttingDown = false;
  warnProductionVoiceIce(env);
  const started = await launchWorker(env);
  if (!started) {
    console.warn(
      '[mediasoup] Сервер работает без голосового SFU. Для сборки worker: в backend выполните «pnpm approve-builds» и переустановите зависимости, либо используйте Linux/WSL.',
    );
  }
  return started;
}

/** Не поднялся (порт занят) — голос работает по-старому, транспорт на свой порт. */
async function launchWebRtcServer(env: Env, created: Worker): Promise<void> {
  const port = env.MEDIASOUP_WEBRTC_PORT;
  if (port === undefined) {
    return;
  }
  const { bindIp, announced } = remoteListenAddress(env);
  try {
    webRtcServer = await created.createWebRtcServer({
      listenInfos: [
        { protocol: 'udp', ip: bindIp, announcedAddress: announced, port },
        { protocol: 'tcp', ip: bindIp, announcedAddress: announced, port },
      ],
    });
    console.info(
      `[mediasoup] WebRtcServer ${bindIp}:${port} announced=${announced ?? '(none)'} — один порт на все транспорты.`,
    );
  } catch (e: unknown) {
    webRtcServer = null;
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[mediasoup] WebRtcServer на порту ${port} не поднят (${msg}). Транспорты берут порты из диапазона.`);
  }
}

async function launchWorker(env: Env): Promise<boolean> {
  try {
    const created = await createWorker({
      logLevel: 'warn',
      ...transportPortRange(env.MEDIASOUP_RTC_MIN_PORT, env.MEDIASOUP_RTC_MAX_PORT, env.MEDIASOUP_WEBRTC_PORT),
    });
    created.on('died', (error) => {
      handleWorkerDied(created, error);
    });
    worker = created;
    await launchWebRtcServer(env, created);
    return true;
  } catch (e: unknown) {
    worker = null;
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[mediasoup] worker не запущен (${msg}).`);
    return false;
  }
}

/** Сбросить всё медиа-состояние. Объекты mediasoup закрываются вместе с worker. */
function resetMediaState(): void {
  producersByChannel.clear();
  screenViewersByChannel.clear();
  clearScreenShareSlots();
  clearAllChannelScreenShares();
  for (const [channelId, r] of routers) {
    routerEpoch.set(channelId, (routerEpoch.get(channelId) ?? 0) + 1);
    forgetSingleFlight(`router:${channelId}`);
    try {
      r.close();
    } catch {
      /* ignore */
    }
  }
  routers.clear();
  peers.clear();
  webRtcServer = null;
}

/**
 * Worker упал: текст и API продолжают работать, участники голоса получают forced voice:left,
 * worker поднимается заново с нарастающей паузой.
 */
function handleWorkerDied(dead: Worker, error: Error): void {
  if (worker !== dead || workerShuttingDown) {
    return;
  }
  console.error(`[mediasoup] worker pid=${dead.pid} упал: ${error.message}. Голос перезапускается.`);
  worker = null;
  resetMediaState();
  evictAllVoiceUsers();
  scheduleWorkerRestart();
}

function scheduleWorkerRestart(): void {
  if (workerRestartTimer || workerShuttingDown || !workerEnv) {
    return;
  }
  const env = workerEnv;
  const delay = Math.min(WORKER_RESTART_MAX_DELAY_MS, 1000 * 2 ** workerRestartAttempts);
  workerRestartTimer = setTimeout(() => {
    workerRestartTimer = null;
    if (workerShuttingDown) return;
    void launchWorker(env).then((ok) => {
      if (ok) {
        workerRestartAttempts = 0;
        console.info('[mediasoup] worker перезапущен.');
        return;
      }
      workerRestartAttempts += 1;
      scheduleWorkerRestart();
    });
  }, delay);
  workerRestartTimer.unref();
}

export async function closeMediasoupVoiceWorker(): Promise<void> {
  workerShuttingDown = true;
  if (workerRestartTimer) {
    clearTimeout(workerRestartTimer);
    workerRestartTimer = null;
  }
  resetMediaState();
  if (worker) {
    try {
      worker.close();
    } catch {
      /* ignore */
    }
    worker = null;
  }
}

function reply(
  socket: WebSocket,
  channelId: number,
  type: string,
  body: Record<string, unknown>,
  requestId?: string,
) {
  const data: Record<string, unknown> = { channel_id: channelId, type, ...body };
  if (requestId) {
    data.request_id = requestId;
  }
  sendWsEnvelope(socket, 'voice:signal', data, requestId);
}

function registerChannelProducer(
  channelId: number,
  producerId: string,
  userId: number,
  source: ProducerSource,
) {
  const prev = producersByChannel.get(channelId) ?? new Map<string, ProducerMeta>();
  const next = new Map(prev);
  next.set(producerId, { userId, source });
  producersByChannel.set(channelId, next);
  console.info(
    `[voice/mediasoup] producer registered channel=${channelId} user=${userId} source=${source} producer=${producerId} total=${next.size}`,
  );
}

function unregisterChannelProducer(channelId: number, producerId: string) {
  const m = producersByChannel.get(channelId);
  if (!m) return;
  const meta = m.get(producerId);
  const next = new Map(m);
  next.delete(producerId);
  if (next.size === 0) {
    producersByChannel.delete(channelId);
  } else {
    producersByChannel.set(channelId, next);
  }
  console.info(
    `[voice/mediasoup] producer unregistered channel=${channelId} user=${meta?.userId ?? '(unknown)'} producer=${producerId} total=${next.size}`,
  );
}

function publishScreenShare(channelId: number, userId: number): void {
  const username = getVoiceParticipantUsername(channelId, userId) ?? '';
  setChannelScreenShare(channelId, { user_id: userId, username });
}

function broadcastScreenAudience(
  channelId: number,
  userId: number,
  action: 'joined' | 'left' | 'ended',
): void {
  broadcastVoiceRoom(channelId, 'voice:screen_audience', {
    channel_id: channelId,
    user_id: userId,
    action,
  });
}

function noteScreenViewer(channelId: number, userId: number): void {
  let viewers = screenViewersByChannel.get(channelId);
  if (!viewers) {
    viewers = new Set();
    screenViewersByChannel.set(channelId, viewers);
  }
  if (viewers.has(userId)) return;
  viewers.add(userId);
  broadcastScreenAudience(channelId, userId, 'joined');
}

function leaveScreenAudience(channelId: number, userId: number): void {
  const viewers = screenViewersByChannel.get(channelId);
  if (!viewers?.delete(userId)) return;
  if (viewers.size === 0) screenViewersByChannel.delete(channelId);
  if (!getScreenSlot(channelId)?.videoProducerId) return;
  broadcastScreenAudience(channelId, userId, 'left');
}

function endScreenAudience(channelId: number, hostUserId: number): void {
  screenViewersByChannel.delete(channelId);
  broadcastScreenAudience(channelId, hostUserId, 'ended');
}

function closePeerScreenConsumers(channelId: number, peer: PeerMedia): void {
  const closing: string[] = [];
  for (const [consumerId, consumer] of peer.consumers) {
    const source = producersByChannel.get(channelId)?.get(consumer.producerId)?.source;
    if (source === 'screen-video' || source === 'screen-audio') closing.push(consumerId);
  }
  for (const consumerId of closing) {
    const consumer = peer.consumers.get(consumerId);
    if (!consumer) continue;
    try {
      consumer.close();
    } catch {
      /* ignore */
    }
    peer.consumers.delete(consumerId);
  }
}

function forgetScreenProducer(channelId: number, producerId: string): void {
  const slot = getScreenSlot(channelId);
  if (!slot) return;
  if (slot.videoProducerId !== producerId && slot.audioProducerId !== producerId) return;
  const ending = slot.videoProducerId === producerId;
  const hostUserId = slot.userId;
  if (slot.videoProducerId === producerId) slot.videoProducerId = null;
  if (slot.audioProducerId === producerId) slot.audioProducerId = null;
  if (!slot.videoProducerId && !slot.audioProducerId) {
    deleteScreenSlot(channelId);
    setChannelScreenShare(channelId, null);
  } else {
    setScreenSlot(channelId, slot);
    if (!slot.videoProducerId) {
      setChannelScreenShare(channelId, null);
    }
  }
  if (ending) {
    endScreenAudience(channelId, hostUserId);
  }
}

function noteScreenProducer(channelId: number, userId: number, source: ProducerSource, producerId: string): void {
  if (source === 'microphone') return;
  const prev = getScreenSlot(channelId);
  const slot =
    prev && prev.userId === userId
      ? { ...prev }
      : { userId, videoProducerId: null, audioProducerId: null };
  if (source === 'screen-video') slot.videoProducerId = producerId;
  if (source === 'screen-audio') slot.audioProducerId = producerId;
  setScreenSlot(channelId, slot);
  if (slot.videoProducerId) {
    publishScreenShare(channelId, userId);
  }
}

function closeScreenSlot(socket: WebSocket, peer: PeerMedia, slot: 'screenVideo' | 'screenAudio'): void {
  const producer = peer[slot];
  if (!producer) return;
  const producerId = producer.id;
  try {
    producer.close();
  } catch {
    /* ignore */
  }
  peer[slot] = undefined;
  removeChannelProducerNotify(peer.channelId, producerId, socket);
}

/** Повторный старт того же пользователя заменяет прошлые screen-producer, в том числе с другого сокета. */
function releaseUserScreen(channelId: number, userId: number, mode: 'all' | 'audio'): void {
  for (const [socket, peer] of peers) {
    if (peer.channelId !== channelId || getVoiceUserIdForSocket(socket) !== userId) continue;
    if (mode === 'all') {
      closeScreenSlot(socket, peer, 'screenVideo');
    }
    closeScreenSlot(socket, peer, 'screenAudio');
  }
}

/** Роль больше не разрешает трансляцию: закрыть её на всех сокетах пользователя. */
export function stopUserScreenShare(userId: number): void {
  for (const [socket, peer] of peers) {
    if (getVoiceUserIdForSocket(socket) !== userId) continue;
    closeScreenSlot(socket, peer, 'screenVideo');
    closeScreenSlot(socket, peer, 'screenAudio');
  }
}

function readProducerSource(payload: Record<string, unknown>): ProducerSource {
  const appData = payload.appData ?? payload.app_data;
  const raw =
    appData && typeof appData === 'object'
      ? (appData as Record<string, unknown>).source
      : payload.source;
  if (raw === 'screen-video' || raw === 'screen-audio') return raw;
  return 'microphone';
}

/** Иначе в listProducers остаются id закрытых producer → canConsume=false → CANNOT_CONSUME. */
function removeChannelProducerNotify(channelId: number, producerId: string, socket: WebSocket) {
  unregisterChannelProducer(channelId, producerId);
  forgetScreenProducer(channelId, producerId);
  const uid = getVoiceUserIdForSocket(socket);
  if (uid !== undefined) {
    broadcastProducerClosed(channelId, uid, producerId);
  }
}

function ensurePeer(socket: WebSocket, channelId: number): PeerMedia {
  let p = peers.get(socket);
  if (!p || p.channelId !== channelId) {
    disposeMediasoupPeerForSocket(socket);
    p = { channelId, consumers: new Map() };
    peers.set(socket, p);
  }
  return p;
}

async function getOrCreateRouter(channelId: number): Promise<Router> {
  if (!worker) {
    throw new Error('mediasoup worker not started');
  }
  const cached = routers.get(channelId);
  if (cached && !cached.closed) return cached;
  const epoch = routerEpoch.get(channelId) ?? 0;
  const workerRef = worker;
  return singleFlight(`router:${channelId}`, async () => {
    const again = routers.get(channelId);
    if (again && !again.closed) return again;
    const created = await workerRef.createRouter({ mediaCodecs: MEDIA_CODECS });
    if ((routerEpoch.get(channelId) ?? 0) !== epoch) {
      try {
        created.close();
      } catch {
        /* ignore */
      }
      const current = routers.get(channelId);
      if (current && !current.closed) return current;
      throw new Error('router closed during create');
    }
    routers.set(channelId, created);
    return created;
  });
}

export function closeVoiceRouter(channelId: number): void {
  routerEpoch.set(channelId, (routerEpoch.get(channelId) ?? 0) + 1);
  forgetSingleFlight(`router:${channelId}`);
  const router = routers.get(channelId);
  routers.delete(channelId);
  if (!router || router.closed) return;
  try {
    router.close();
  } catch {
    /* ignore */
  }
}

function socketRemoteAddress(socket: WebSocket): string | undefined {
  const fromUpgrade = getRememberedWsClientIp(socket);
  if (typeof fromUpgrade === 'string' && fromUpgrade.length > 0) {
    return fromUpgrade;
  }
  const raw = (socket as unknown as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress;
  if (typeof raw !== 'string') {
    return undefined;
  }
  return raw;
}

function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) {
    return false;
  }
  if (addr === '127.0.0.1' || addr === '::1') {
    return true;
  }
  return addr.startsWith('::ffff:127.');
}

/**
 * Для WS с loopback (два окна на одном ПК) mediasoup даёт достаточные host-кандидаты.
 * Передача STUN/TURN на 127.0.0.1 часто заставляет Chrome уйти в prflx/relay на loopback без RTP.
 */
function iceServersForClientSocket(socket: WebSocket): IceServer[] {
  if (isLoopbackAddress(socketRemoteAddress(socket))) {
    return [];
  }
  const userId = getVoiceUserIdForSocket(socket);
  return iceServersForVoiceClient(iceServersCache, {
    secret: turnAuthSecret,
    userId: userId ?? 0,
    nowSec: Math.floor(Date.now() / 1000),
  });
}

/** Адрес для loopback-клиента (два окна на одном ПК): свой транспорт на 127.0.0.1. */
function loopbackListenAddress(env: Env): { bindIp: string; announced: string } {
  const explicitBind = env.MEDIASOUP_BIND_IP?.trim();
  let bindIp = explicitBind || env.MEDIASOUP_LISTEN_IP.trim();
  if (!explicitBind) {
    // Windows: listen 0.0.0.0 + UDP к mediasoup часто даёт «DTLS есть, RTP нет» между двумя браузерами на одном ПК.
    if (bindIp === '' || bindIp === '0.0.0.0' || bindIp === '::' || bindIp === '[::]') {
      bindIp = '127.0.0.1';
    }
  }
  // Для тестов "два окна на одном ПК" LAN announced часто не даёт RTP;
  // принудительный loopback-кандидат стабилизирует локальный маршрут.
  return { bindIp, announced: '127.0.0.1' };
}

function transportOptions(env: Env, socket: WebSocket) {
  const localClient = isLoopbackAddress(socketRemoteAddress(socket));

  const preferUdpRaw = (env.MEDIASOUP_PREFER_UDP ?? '').trim().toLowerCase();
  const preferUdpCfg = !['0', 'false', 'no', 'off'].includes(preferUdpRaw);
  const forceUdpLoopback = ['1', 'true', 'yes', 'on'].includes(preferUdpRaw);
  // На loopback по умолчанию TCP ICE (preferUdp=false); UDP можно вернуть через MEDIASOUP_PREFER_UDP=1.
  const preferUdp = localClient ? forceUdpLoopback : preferUdpCfg;

  if (!localClient && webRtcServer) {
    return { webRtcServer, enableUdp: true, enableTcp: true, preferUdp };
  }
  const { bindIp, announced } = localClient ? loopbackListenAddress(env) : remoteListenAddress(env);
  return {
    listenIps: [{ ip: bindIp, announcedIp: announced }],
    enableUdp: true,
    enableTcp: true,
    preferUdp,
  };
}

function broadcastNewProducer(
  except: WebSocket,
  channelId: number,
  userId: number,
  producerId: string,
  source: ProducerSource,
) {
  broadcastVoiceRoom(
    channelId,
    'voice:new_producer',
    {
      channel_id: channelId,
      user_id: userId,
      producer_id: producerId,
      kind: source === 'screen-video' ? 'video' : 'audio',
      source,
    },
    except,
  );
}

function broadcastProducerClosed(channelId: number, userId: number, producerId: string) {
  broadcastVoiceRoom(channelId, 'voice:producer_closed', {
    channel_id: channelId,
    user_id: userId,
    producer_id: producerId,
  });
}

/** Микрофон молчит при заглушке админа и при запрете роли; звук трансляции — только при заглушке. */
function isAudioBlocked(userId: number, source: ProducerSource): boolean {
  return source === 'microphone' ? isVoiceMicBlocked(userId) : isVoiceServerMuted(userId);
}

function enforceServerMute(producer: Producer, userId: number, source: ProducerSource): void {
  producer.observer.on('resume', () => {
    if (isAudioBlocked(userId, source)) {
      void producer.pause();
    }
  });
}

export function setMediasoupProducerPaused(socket: WebSocket, paused: boolean, scope: VoicePauseScope): void {
  const peer = peers.get(socket);
  if (!peer) return;
  const userId = getVoiceUserIdForSocket(socket);
  const slots: [Producer | undefined, ProducerSource][] =
    scope === 'microphone' ? [[peer.producer, 'microphone']] : [[peer.producer, 'microphone'], [peer.screenAudio, 'screen-audio']];
  for (const [producer, source] of slots) {
    if (!producer || producer.closed) continue;
    if (paused || (userId !== undefined && isAudioBlocked(userId, source))) {
      if (!producer.paused) {
        void producer.pause();
      }
      continue;
    }
    if (producer.paused) {
      void producer.resume();
    }
  }
}

export function disposeMediasoupPeerForSocket(socket: WebSocket): void {
  const peer = peers.get(socket);
  if (!peer) return;
  const producerIds = [peer.producer?.id, peer.screenVideo?.id, peer.screenAudio?.id].filter(
    (id): id is string => typeof id === 'string',
  );
  const uid = getVoiceUserIdForSocket(socket);
  const ch = peer.channelId;
  peers.delete(socket);
  for (const producer of [peer.producer, peer.screenVideo, peer.screenAudio]) {
    try {
      producer?.close();
    } catch {
      /* ignore */
    }
  }
  for (const c of peer.consumers.values()) {
    try {
      c.close();
    } catch {
      /* ignore */
    }
  }
  try {
    peer.sendTransport?.close();
  } catch {
    /* ignore */
  }
  try {
    peer.recvTransport?.close();
  } catch {
    /* ignore */
  }
  for (const producerId of producerIds) {
    unregisterChannelProducer(ch, producerId);
    forgetScreenProducer(ch, producerId);
    if (uid !== undefined) {
      broadcastProducerClosed(ch, uid, producerId);
    }
  }
  if (uid !== undefined) {
    leaveScreenAudience(ch, uid);
  }
}

export async function handleVoiceMediasoupSignal(
  socket: WebSocket,
  env: Env,
  data: Record<string, unknown>,
  requestId: string | undefined,
): Promise<void> {
  const channelId =
    typeof data.channel_id === 'number' || typeof data.channel_id === 'string'
      ? Number(data.channel_id)
      : Number(data.channelId);
  const type = typeof data.type === 'string' ? data.type : '';
  const payload =
    data.payload && typeof data.payload === 'object' ? (data.payload as Record<string, unknown>) : {};

  if (!Number.isFinite(channelId)) {
    sendWsEnvelope(socket, 'voice:error', { code: 'INVALID_EVENT' }, requestId);
    return;
  }
  const joinedCh = getSocketVoiceChannelId(socket);
  if (joinedCh === undefined || joinedCh !== channelId) {
    sendWsEnvelope(socket, 'voice:error', { code: 'VOICE_NOT_CONNECTED' }, requestId);
    return;
  }
  if (!worker) {
    reply(socket, channelId, type, { ok: false, error: 'MEDIASOUP_UNAVAILABLE' }, requestId);
    return;
  }

  try {
    switch (type) {
      case 'listProducers': {
        const selfPeer = peers.get(socket);
        const ownIds = new Set(
          [selfPeer?.producer?.id, selfPeer?.screenVideo?.id, selfPeer?.screenAudio?.id].filter(
            (id): id is string => typeof id === 'string',
          ),
        );
        const m = producersByChannel.get(channelId);
        const list: { producer_id: string; user_id: number; source: ProducerSource; kind: 'audio' | 'video' }[] =
          [];
        if (m) {
          for (const [producer_id, meta] of m) {
            if (ownIds.has(producer_id)) {
              continue;
            }
            list.push({
              producer_id,
              user_id: meta.userId,
              source: meta.source,
              kind: meta.source === 'screen-video' ? 'video' : 'audio',
            });
          }
        }
        reply(socket, channelId, type, { ok: true, producers: list }, requestId);
        return;
      }
      case 'getRouterCapabilities': {
        const router = await getOrCreateRouter(channelId);
        const iceList = iceServersForClientSocket(socket);
        // Без ICE с сервера (loopback) политика relay ломает только host-кандидаты mediasoup.
        const icePolicy =
          iceList.length === 0
            ? 'all'
            : env.RTC_ICE_TRANSPORT_POLICY === 'relay'
              ? 'relay'
              : 'all';
        reply(
          socket,
          channelId,
          type,
          {
            ok: true,
            rtp_capabilities: router.rtpCapabilities,
            ice_servers: iceList,
            ice_transport_policy: icePolicy,
          },
          requestId,
        );
        return;
      }
      case 'createTransport': {
        const direction = payload.direction === 'recv' ? 'recv' : 'send';
        const router = await getOrCreateRouter(channelId);
        const tOpts = transportOptions(env, socket);
        const transport = await router.createWebRtcTransport(tOpts);
        if (direction === 'send') {
          await transport.setMaxIncomingBitrate(SEND_MAX_INCOMING_BITRATE);
        }
        const li = tOpts.listenIps?.[0];
        const ann = li?.announcedIp;
        const bip = li?.ip;
        const raddr = socketRemoteAddress(socket) ?? '(unknown)';
        const listen = li
          ? `bindIp=${bip === undefined || bip === '' ? '(?)' : String(bip)} announcedIp=${ann === undefined || ann === '' ? '(none)' : String(ann)}`
          : 'webRtcServer';
        console.info(
          `[voice/mediasoup] WebRtcTransport ${direction} id=${transport.id} remote=${raddr} ${listen} preferUdp=${String(tOpts.preferUdp ?? true)}`,
        );
        transport.on('iceselectedtuplechange', (tuple) => {
          const userId = getVoiceUserIdForSocket(socket);
          const remote =
            typeof tuple.remoteIp === 'string' && typeof tuple.remotePort === 'number'
              ? `${tuple.remoteIp}:${tuple.remotePort}`
              : '(pending)';
          console.info(
            `[voice/mediasoup] ice tuple direction=${direction} user=${userId ?? '(unknown)'} transport=${transport.id} protocol=${tuple.protocol} remote=${remote}`,
          );
        });
        const peer = ensurePeer(socket, channelId);
        if (direction === 'send') {
          if (peer.sendTransport) {
            for (const slot of ['producer', 'screenVideo', 'screenAudio'] as const) {
              const orphan = peer[slot];
              if (!orphan) continue;
              const orphanedProducerId = orphan.id;
              try {
                orphan.close();
              } catch {
                /* ignore */
              }
              peer[slot] = undefined;
              removeChannelProducerNotify(channelId, orphanedProducerId, socket);
            }
            try {
              peer.sendTransport.close();
            } catch {
              /* ignore */
            }
          }
          peer.sendTransport = transport;
        } else {
          if (peer.recvTransport) {
            for (const c of peer.consumers.values()) {
              try {
                c.close();
              } catch {
                /* ignore */
              }
            }
            peer.consumers.clear();
            try {
              peer.recvTransport.close();
            } catch {
              /* ignore */
            }
          }
          peer.recvTransport = transport;
        }
        reply(
          socket,
          channelId,
          type,
          {
            ok: true,
            direction,
            id: transport.id,
            ice_parameters: transport.iceParameters,
            ice_candidates: transport.iceCandidates,
            dtls_parameters: transport.dtlsParameters,
          },
          requestId,
        );
        return;
      }
      case 'connectTransport': {
        const direction = payload.direction === 'recv' ? 'recv' : 'send';
        const dtls =
          (payload.dtlsParameters as DtlsParameters | undefined) ??
          (payload.dtls_parameters as DtlsParameters | undefined);
        if (!dtls) {
          reply(socket, channelId, type, { ok: false, error: 'MISSING_DTLS' }, requestId);
          return;
        }
        const peer = peers.get(socket);
        if (!peer || peer.channelId !== channelId) {
          reply(socket, channelId, type, { ok: false, error: 'NO_TRANSPORT' }, requestId);
          return;
        }
        const t = direction === 'send' ? peer.sendTransport : peer.recvTransport;
        if (!t) {
          reply(socket, channelId, type, { ok: false, error: 'NO_TRANSPORT' }, requestId);
          return;
        }
        try {
          await t.connect({ dtlsParameters: dtls });
        } catch (connectErr: unknown) {
          const cmsg = connectErr instanceof Error ? connectErr.message : String(connectErr);
          if (/already|same state|Invalid state|connected/i.test(cmsg)) {
            reply(socket, channelId, type, { ok: true, idempotent: true }, requestId);
            return;
          }
          throw connectErr;
        }
        reply(socket, channelId, type, { ok: true }, requestId);
        return;
      }
      case 'produce': {
        const rtpParameters =
          (payload.rtpParameters as RtpParameters | undefined) ??
          (payload.rtp_parameters as RtpParameters | undefined);
        if (!rtpParameters) {
          reply(socket, channelId, type, { ok: false, error: 'MISSING_RTP' }, requestId);
          return;
        }
        const peer = peers.get(socket);
        if (!peer?.sendTransport) {
          reply(socket, channelId, type, { ok: false, error: 'NO_SEND_TRANSPORT' }, requestId);
          return;
        }
        const source = readProducerSource(payload);
        const userId = getVoiceUserIdForSocket(socket);
        if (source !== 'microphone') {
          if (userId === undefined) {
            reply(socket, channelId, type, { ok: false, error: 'VOICE_NOT_CONNECTED' }, requestId);
            return;
          }
          if (!(await getChannelPermissions(userId, channelId)).screenShare) {
            reply(socket, channelId, type, { ok: false, error: 'VOICE_SCREEN_FORBIDDEN' }, requestId);
            return;
          }
          releaseUserScreen(channelId, userId, source === 'screen-video' ? 'all' : 'audio');
          if (!claimScreenShare(channelId, userId)) {
            reply(socket, channelId, type, { ok: false, error: 'SCREEN_SHARE_BUSY' }, requestId);
            return;
          }
        } else if (peer.producer) {
          const oldPid = peer.producer.id;
          try {
            peer.producer.close();
          } catch {
            /* ignore */
          }
          peer.producer = undefined;
          removeChannelProducerNotify(channelId, oldPid, socket);
        }
        if (
          userId !== undefined &&
          isAudioSourceBlockedByServerMute(source, isVoiceServerMuted(userId))
        ) {
          if (source !== 'microphone') {
            releaseUnboundScreenClaim(channelId, userId);
          }
          reply(socket, channelId, type, { ok: false, error: 'VOICE_SERVER_MUTED' }, requestId);
          return;
        }
        let producer: Producer;
        try {
          producer = await peer.sendTransport.produce({
            kind: source === 'screen-video' ? 'video' : 'audio',
            rtpParameters,
            appData: { source },
          });
        } catch (produceErr: unknown) {
          if (source !== 'microphone' && userId !== undefined) {
            releaseUnboundScreenClaim(channelId, userId);
          }
          throw produceErr;
        }
        if (source === 'screen-video') {
          peer.screenVideo = producer;
        } else if (source === 'screen-audio') {
          peer.screenAudio = producer;
        } else {
          peer.producer = producer;
        }
        const audioSource = source === 'microphone' || source === 'screen-audio';
        if (audioSource && userId !== undefined) {
          enforceServerMute(producer, userId, source);
          if (isAudioBlocked(userId, source)) {
            if (!producer.paused) {
              await producer.pause();
            }
          } else if (producer.paused) {
            await producer.resume();
          }
        } else if (producer.paused) {
          await producer.resume();
        }
        if (userId !== undefined) {
          registerChannelProducer(channelId, producer.id, userId, source);
          noteScreenProducer(channelId, userId, source, producer.id);
          broadcastNewProducer(socket, channelId, userId, producer.id, source);
          producer.on('transportclose', () => {
            console.info(
              `[voice/mediasoup] producer transportclose channel=${channelId} user=${userId} source=${source} producer=${producer.id}`,
            );
            removeChannelProducerNotify(channelId, producer.id, socket);
          });
          console.info(
            `[voice/mediasoup] produce ok channel=${channelId} user=${userId} source=${source} producer=${producer.id}`,
          );
        } else {
          console.warn(
            `[voice/mediasoup] produce without voice user channel=${channelId} producer=${producer.id}`,
          );
        }
        reply(socket, channelId, type, { ok: true, id: producer.id }, requestId);
        return;
      }
      case 'closeProducer': {
        const producerId =
          typeof payload.producerId === 'string'
            ? payload.producerId
            : typeof payload.producer_id === 'string'
              ? payload.producer_id
              : '';
        const peer = peers.get(socket);
        if (!peer || !producerId) {
          reply(socket, channelId, type, { ok: false, error: 'NO_PRODUCER' }, requestId);
          return;
        }
        const slot = (
          [
            ['producer', peer.producer],
            ['screenVideo', peer.screenVideo],
            ['screenAudio', peer.screenAudio],
          ] as const
        ).find((entry) => entry[1]?.id === producerId);
        if (!slot?.[1]) {
          reply(socket, channelId, type, { ok: true, idempotent: true }, requestId);
          return;
        }
        try {
          slot[1].close();
        } catch {
          /* ignore */
        }
        peer[slot[0]] = undefined;
        removeChannelProducerNotify(channelId, producerId, socket);
        reply(socket, channelId, type, { ok: true }, requestId);
        return;
      }
      case 'consume': {
        const producerId =
          typeof payload.producerId === 'string'
            ? payload.producerId
            : typeof payload.producer_id === 'string'
              ? payload.producer_id
              : '';
        const caps =
          (payload.rtpCapabilities as RtpCapabilities | undefined) ??
          (payload.rtp_capabilities as RtpCapabilities | undefined);
        if (!producerId || !caps) {
          reply(socket, channelId, type, { ok: false, error: 'MISSING_CONSUME_FIELDS' }, requestId);
          return;
        }
        const router = await getOrCreateRouter(channelId);
        if (!router.canConsume({ producerId, rtpCapabilities: caps })) {
          reply(
            socket,
            channelId,
            type,
            {
              ok: false,
              error: 'CANNOT_CONSUME',
              message: 'producer отсутствует на роутере или RTP capabilities не совместимы с producer',
            },
            requestId,
          );
          return;
        }
        const peer = peers.get(socket);
        if (!peer?.recvTransport) {
          reply(socket, channelId, type, { ok: false, error: 'NO_RECV_TRANSPORT' }, requestId);
          return;
        }
        // Повторный consume того же producer заменяет прошлый consumer: иначе один клиент
        // может заставить SFU слать ему сотни копий демонстрации и забить исходящий канал.
        for (const [existingId, existing] of [...peer.consumers]) {
          if (!existing.closed && existing.producerId !== producerId) continue;
          try {
            existing.close();
          } catch {
            /* ignore */
          }
          peer.consumers.delete(existingId);
        }
        if (peer.consumers.size >= MAX_CONSUMERS_PER_PEER) {
          reply(socket, channelId, type, { ok: false, error: 'TOO_MANY_CONSUMERS' }, requestId);
          return;
        }
        const consumer = await peer.recvTransport.consume({
          producerId,
          rtpCapabilities: caps,
          paused: false,
        });
        peer.consumers.set(consumer.id, consumer);
        const forgetConsumer = () => {
          if (peer.consumers.get(consumer.id) === consumer) {
            peer.consumers.delete(consumer.id);
          }
        };
        consumer.on('producerclose', forgetConsumer);
        consumer.on('transportclose', forgetConsumer);
        const userId = getVoiceUserIdForSocket(socket);
        const produced = producersByChannel.get(channelId)?.get(producerId);
        if (
          produced?.source === 'screen-video' &&
          userId !== undefined &&
          userId !== produced.userId
        ) {
          noteScreenViewer(channelId, userId);
        }
        console.info(
          `[voice/mediasoup] consume ok channel=${channelId} user=${userId ?? '(unknown)'} producer=${producerId} consumer=${consumer.id}`,
        );
        reply(
          socket,
          channelId,
          type,
          {
            ok: true,
            id: consumer.id,
            producer_id: consumer.producerId,
            kind: consumer.kind,
            rtp_parameters: consumer.rtpParameters,
          },
          requestId,
        );
        return;
      }
      case 'unwatchScreen': {
        const peer = peers.get(socket);
        const userId = getVoiceUserIdForSocket(socket);
        if (peer) {
          closePeerScreenConsumers(channelId, peer);
        }
        if (userId !== undefined) {
          leaveScreenAudience(channelId, userId);
        }
        reply(socket, channelId, type, { ok: true }, requestId);
        return;
      }
      case 'resumeConsumer': {
        const consumerId =
          typeof payload.consumerId === 'string'
            ? payload.consumerId
            : typeof payload.consumer_id === 'string'
              ? payload.consumer_id
              : '';
        const peer = peers.get(socket);
        const consumer = peer?.consumers.get(consumerId);
        if (!consumer) {
          reply(socket, channelId, type, { ok: false, error: 'NO_CONSUMER' }, requestId);
          return;
        }
        await consumer.resume();
        const userId = getVoiceUserIdForSocket(socket);
        console.info(
          `[voice/mediasoup] resume consumer channel=${channelId} user=${userId ?? '(unknown)'} consumer=${consumer.id} producer=${consumer.producerId}`,
        );
        reply(socket, channelId, type, { ok: true }, requestId);
        return;
      }
      default:
        reply(socket, channelId, type, { ok: false, error: 'UNKNOWN_SIGNAL' }, requestId);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(`[voice/mediasoup] signal=${type} channel=${channelId}`, msg, stack ?? '');
    reply(socket, channelId, type, mediasoupSignalFailure(), requestId);
  }
}

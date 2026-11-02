import {
  getAccessToken,
  getRefreshToken,
  isSessionTokenStorageKey,
  subscribeAccessTokenChange,
} from '../lib/auth-storage';
import { randomClientId } from '../lib/random-client-id';
import { resolveWsUrl } from '../lib/server-target';
import { clearSessionClient, getSessionEpoch } from '../lib/session-reset';
import { ensureAccessTokenFresh, isTerminalAuthFailure } from '../api/token-refresh';

function defaultWsUrl(): string {
  const desktop = resolveWsUrl();
  if (desktop) {
    return desktop;
  }
  const raw = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (raw) {
    return raw.endsWith('/ws') ? raw : `${raw.replace(/\/$/, '')}/ws`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export type RealtimeListener = (event: string, data: Record<string, unknown>) => void;

const listeners = new Set<RealtimeListener>();

let ws: WebSocket | null = null;
let identified = false;
/** Access, который сервер уже принял на этом сокете. */
let identifiedAccessToken: string | null = null;
/** Access, для которого `auth:identify` уже ушёл и ответ ещё не разобран. */
let identifyInFlightToken: string | null = null;
/** `undefined` — нет отложенного join; `null` — leave; число — join канала */
let pendingJoin: number | null | undefined = undefined;
/** Голосовая комната: та же семантика, что у `pendingJoin`. */
let pendingVoice: number | null | undefined = undefined;
/** Последний отправленный voice:join (undefined — ещё не в голосе по WS). */
let voiceWsJoinedId: number | undefined = undefined;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let wantConnection = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let reconnectHold: Promise<void> | null = null;
/** Сколько раз сокет рвался и планировался заново за этот запуск страницы. */
let reconnectsTotal = 0;
let lastPongAtMs: number | null = null;
/** Последний входящий кадр текущего сокета. По нему видно полуоткрытое TCP после сна или смены сети. */
let lastInboundAtMs = 0;
const PING_INTERVAL_MS = 25_000;
/** Три пропущенных ping подряд: сокет считается мёртвым, даже если браузер ещё не прислал close. */
const SOCKET_SILENCE_LIMIT_MS = 80_000;
let networkListenersInstalled = false;

export type SignalingDebug = {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' | 'none';
  identified: boolean;
  /** `null`, пока сервер ни разу не ответил `system:pong`. */
  pongAgeMs: number | null;
  reconnects: number;
};

function socketReadyState(socket: WebSocket | null): SignalingDebug['readyState'] {
  if (!socket) {
    return 'none';
  }
  switch (socket.readyState) {
    case WebSocket.CONNECTING:
      return 'connecting';
    case WebSocket.OPEN:
      return 'open';
    case WebSocket.CLOSING:
      return 'closing';
    case WebSocket.CLOSED:
      return 'closed';
    default:
      return 'none';
  }
}

/** Состояние сигналинга для отчёта голосового инцидента. */
export function getSignalingDebug(): SignalingDebug {
  return {
    readyState: socketReadyState(ws),
    identified,
    pongAgeMs: lastPongAtMs === null ? null : Math.max(0, Date.now() - lastPongAtMs),
    reconnects: reconnectsTotal,
  };
}
/** Канал, в который нужно вернуться после обрыва сокета. `null` — никуда не входим. */
let desiredChannel: number | null = null;
/** Голосовая комната для повторного входа. `null` — не в голосе. */
let desiredVoice: number | null = null;

function endClientSession(): void {
  wantConnection = false;
  clearSessionClient();
  dispatch('auth:force_logout', { code: 'SESSION_REVOKED' });
}

function holdReconnectForRefresh(): void {
  if (reconnectHold) {
    return;
  }
  reconnectHold = ensureAccessTokenFresh({ force: true })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : '';
      if (!getRefreshToken() || isTerminalAuthFailure(message) || message.startsWith('UNAUTHORIZED')) {
        endClientSession();
      }
    })
    .finally(() => {
      reconnectHold = null;
    });
}

function scheduleReconnect(): void {
  if (!wantConnection || reconnectTimer) {
    return;
  }
  reconnectsTotal += 1;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 15_000);
  reconnectAttempt += 1;
  dispatch('connection:status', { state: 'reconnecting' });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, delay);
}

function clearSocketIdentity(): void {
  identified = false;
  identifiedAccessToken = null;
  identifyInFlightToken = null;
}

function sendAuthIdentify(token: string): void {
  identifyInFlightToken = token;
  send('auth:identify', { accessToken: token });
}

/** Новый access на уже открытом сокете: сервер обновляет exp и не рвёт голос. */
function reidentifyOpenSocket(): void {
  if (!identified || ws?.readyState !== WebSocket.OPEN) {
    return;
  }
  const token = getAccessToken();
  if (!token || token === identifiedAccessToken || identifyInFlightToken !== null) {
    return;
  }
  sendAuthIdentify(token);
}

/** `false` — сокет не открыт, событие не ушло. */
function send(event: string, data: Record<string, unknown>, requestId?: string): boolean {
  if (ws?.readyState !== WebSocket.OPEN) {
    return false;
  }
  const payload = requestId
    ? { event, data, request_id: requestId, meta: { requestId } }
    : { event, data, meta: {} };
  ws.send(JSON.stringify(payload));
  return true;
}

function dispatch(event: string, data: Record<string, unknown>) {
  for (const l of listeners) {
    // Ошибка одного подписчика не должна лишать события остальных (чат, голос, presence).
    try {
      l(event, data);
    } catch (error: unknown) {
      console.error('[realtime] listener failed', event, error);
    }
  }
}

function flushPendingJoin() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !identified) {
    return;
  }
  if (pendingJoin === undefined) {
    return;
  }
  const id = pendingJoin;
  pendingJoin = undefined;
  if (id === null) {
    send('channel:leave', {});
  } else {
    send('channel:join', { channel_id: id });
  }
}

function flushPendingVoiceJoin() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !identified) {
    return;
  }
  if (pendingVoice === undefined) {
    return;
  }
  const id = pendingVoice;
  pendingVoice = undefined;
  if (id === null) {
    if (voiceWsJoinedId === undefined) {
      return;
    }
    send('voice:leave', {});
    voiceWsJoinedId = undefined;
  } else {
    send('voice:join', { channel_id: id });
    voiceWsJoinedId = id;
  }
}

/** Сокет открыт и сервер принял `auth:identify`. */
export function isRealtimeIdentified(): boolean {
  return identified && ws?.readyState === WebSocket.OPEN;
}

export function subscribeRealtime(listener: RealtimeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function onSocketMessage(ev: MessageEvent): void {
  let parsed: {
    event?: string;
    data?: Record<string, unknown>;
    meta?: { requestId?: string };
    request_id?: string;
  };
  try {
    parsed = JSON.parse(String(ev.data)) as typeof parsed;
  } catch {
    return;
  }
  const event = parsed.event ?? '';
  const dataRaw =
    parsed.data && typeof parsed.data === 'object' ? (parsed.data as Record<string, unknown>) : {};
  const meta =
    parsed.meta && typeof parsed.meta === 'object'
      ? (parsed.meta as { requestId?: string })
      : {};
  const data = { ...dataRaw };
  if (typeof parsed.request_id === 'string') {
    data.request_id = parsed.request_id;
  } else if (typeof meta.requestId === 'string') {
    data.request_id = meta.requestId;
  }
  if (event === 'system:pong') {
    lastPongAtMs = Date.now();
  }
  if (event === 'auth:expired') {
    holdReconnectForRefresh();
  }
  if (event === 'auth:revoked') {
    if (!getRefreshToken()) {
      endClientSession();
    } else {
      holdReconnectForRefresh();
    }
  }
  if (event === 'auth:error') {
    const failedToken = identifyInFlightToken;
    identifyInFlightToken = null;
    const code = typeof data.code === 'string' ? data.code : '';
    if (code === 'SESSION_REVOKED' || code === 'KICKED' || code === 'ACCOUNT_DISABLED') {
      endClientSession();
    } else if (getAccessToken() !== failedToken) {
      reidentifyOpenSocket();
    }
  }
  if (event === 'auth:success' || event === 'auth:identified') {
    const alreadyIdentified = identified;
    identified = true;
    if (identifyInFlightToken) {
      identifiedAccessToken = identifyInFlightToken;
    }
    identifyInFlightToken = null;
    if (alreadyIdentified) {
      reidentifyOpenSocket();
      return;
    }
    if (desiredChannel !== null) {
      pendingJoin = desiredChannel;
    }
    flushPendingJoin();
    if (desiredVoice !== null) {
      pendingVoice = desiredVoice;
    }
    flushPendingVoiceJoin();
    dispatch('connection:status', { state: 'online' });
    reidentifyOpenSocket();
  }
  dispatch(event, data);
}

function onSocketClose(socket: WebSocket): void {
  // После disconnect→connect старый сокет закрывается асинхронно; без проверки он обнулит ссылку на уже новый ws.
  if (ws !== socket) {
    return;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  ws = null;
  clearSocketIdentity();
  voiceWsJoinedId = undefined;
  if (wantConnection) {
    const hold = reconnectHold;
    if (hold) {
      void hold.finally(() => {
        if (wantConnection) {
          scheduleReconnect();
        }
      });
      return;
    }
    scheduleReconnect();
  }
}

/** Другая вкладка удалила токены: эта должна закрыть сокет и уйти на вход. */
export function installCrossTabSessionSync(): void {
  window.addEventListener('storage', (event) => {
    if (!isSessionTokenStorageKey(event.key)) {
      return;
    }
    if (event.newValue !== null) {
      reidentifyOpenSocket();
      return;
    }
    if (getAccessToken() || getRefreshToken()) {
      return;
    }
    wantConnection = false;
    disconnectAppRealtime();
    clearSessionClient();
    dispatch('auth:force_logout', { code: 'SESSION_REVOKED' });
  });
}

/** Сеть вернулась или окно проснулось: не ждать конца backoff и проверить живость открытого сокета. */
function installNetworkListeners(): void {
  if (networkListenersInstalled) {
    return;
  }
  networkListenersInstalled = true;
  const reviveSoon = () => {
    if (!wantConnection) {
      return;
    }
    if (ws?.readyState === WebSocket.OPEN) {
      if (Date.now() - lastInboundAtMs > SOCKET_SILENCE_LIMIT_MS) {
        dropSilentSocket(ws);
        return;
      }
      send('system:ping', {});
      return;
    }
    if (reconnectTimer && !reconnectHold) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectAttempt = 0;
      openSocket();
    }
  };
  window.addEventListener('online', reviveSoon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      reviveSoon();
    }
  });
}

/** Полуоткрытый сокет: браузер может минутами не присылать close. Забываем его сразу и переподключаемся. */
function dropSilentSocket(socket: WebSocket): void {
  onSocketClose(socket);
  try {
    socket.close();
  } catch {
    /* уже закрыт */
  }
}

export function connectAppRealtime(): void {
  wantConnection = true;
  installNetworkListeners();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  openSocket();
}

function openSocket(): void {
  if (!wantConnection) {
    return;
  }
  if (ws?.readyState === WebSocket.CONNECTING || ws?.readyState === WebSocket.OPEN) {
    flushPendingJoin();
    flushPendingVoiceJoin();
    return;
  }
  clearSocketIdentity();

  const socket = new WebSocket(defaultWsUrl());
  ws = socket;

  socket.addEventListener('open', () => {
    reconnectAttempt = 0;
    lastInboundAtMs = Date.now();
    const token = getAccessToken();
    if (!token) {
      wantConnection = false;
      socket.close();
      return;
    }
    sendAuthIdentify(token);
    if (pingTimer) {
      clearInterval(pingTimer);
    }
    send('system:ping', {});
    pingTimer = setInterval(() => {
      if (ws !== socket) {
        return;
      }
      if (Date.now() - lastInboundAtMs > SOCKET_SILENCE_LIMIT_MS) {
        dropSilentSocket(socket);
        return;
      }
      send('system:ping', {});
    }, PING_INTERVAL_MS);
  });

  const openedEpoch = getSessionEpoch();
  socket.addEventListener('message', (ev) => {
    if (ws === socket) {
      lastInboundAtMs = Date.now();
    }
    if (openedEpoch !== getSessionEpoch()) {
      return;
    }
    onSocketMessage(ev);
  });
  socket.addEventListener('close', () => onSocketClose(socket));
}

export function disconnectAppRealtime(): void {
  wantConnection = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (ws?.readyState === WebSocket.OPEN && identified) {
    joinRealtimeChannel(null);
    joinVoiceChannel(null);
  }
  desiredChannel = null;
  desiredVoice = null;
  ws?.close();
  ws = null;
  clearSocketIdentity();
  pendingJoin = undefined;
  pendingVoice = undefined;
  voiceWsJoinedId = undefined;
}

export function joinRealtimeChannel(channelId: number | null): void {
  desiredChannel = channelId;
  pendingJoin = channelId;
  flushPendingJoin();
}

export function joinVoiceChannel(channelId: number | null): void {
  if (channelId === null) {
    desiredVoice = null;
    if (voiceWsJoinedId === undefined && pendingVoice === undefined) {
      return;
    }
    pendingVoice = null;
  } else {
    desiredVoice = channelId;
    pendingVoice = channelId;
  }
  flushPendingVoiceJoin();
}

/** Текущий голосовой канал по WS (после успешного voice:join). */
export function getVoiceWsJoinedChannelId(): number | undefined {
  return voiceWsJoinedId;
}

export function sendPresenceAfk(afk: boolean): void {
  send('presence:set_afk', { afk });
}

export function sendPresenceActivity(game: string | null): void {
  send('presence:set_activity', { game });
}

/** `false` — сокет закрыт, сообщение не ушло и ack не придёт. */
export function sendChatMessage(
  channelId: number,
  tempId: string,
  content: string,
  attachmentIds: string[] = [],
): boolean {
  if (!identified) {
    return false;
  }
  return send('message:send', {
    temp_id: tempId,
    channel_id: channelId,
    content,
    ...(attachmentIds.length > 0 ? { attachment_ids: attachmentIds } : {}),
  });
}

export function sendEditMessage(messageId: number, content: string): void {
  send('message:edit', { message_id: messageId, content });
}

export function sendDeleteMessage(messageId: number): void {
  send('message:delete', { message_id: messageId });
}

export function forgetDesiredVoiceChannel(): void {
  desiredVoice = null;
  pendingVoice = undefined;
  voiceWsJoinedId = undefined;
}

export type VoiceModerationResult = { ok: boolean; code?: string };

export function requestVoiceModeration(
  event: 'voice:server_mute' | 'voice:kick' | 'voice:move',
  data: Record<string, unknown>,
): Promise<VoiceModerationResult> {
  const requestId = randomClientId();
  if (!isRealtimeIdentified()) {
    return Promise.resolve({ ok: false, code: 'OFFLINE' });
  }
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      unsub();
      resolve({ ok: false, code: 'TIMEOUT' });
    }, 8_000);
    const unsub = subscribeRealtime((ev, payload) => {
      if (ev !== 'voice:moderation_result' || payload.request_id !== requestId) {
        return;
      }
      window.clearTimeout(timeout);
      unsub();
      resolve({
        ok: payload.ok === true,
        code: typeof payload.code === 'string' ? payload.code : undefined,
      });
    });
    send(event, data, requestId);
  });
}

export function sendVoiceMute(muted?: boolean): void {
  const data: Record<string, unknown> = {};
  if (muted !== undefined) {
    data.muted = muted;
  }
  send('voice:mute', data);
}

export function sendVoiceDeafen(deafened?: boolean): void {
  const data: Record<string, unknown> = {};
  if (deafened !== undefined) {
    data.deafened = deafened;
  }
  send('voice:deafen', data);
}

export function sendVoiceSpeaking(speaking: boolean): void {
  send('voice:speaking', { speaking });
}

export async function requestVoiceSignal(
  channelId: number,
  type: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const requestId = randomClientId();
  return new Promise((resolve, reject) => {
    const to = window.setTimeout(() => {
      unsub();
      reject(new Error('voice_signal_timeout'));
    }, 25_000);
    const unsub = subscribeRealtime((ev, data) => {
      // Канал не совпал с комнатой сокета — сервер отвечает voice:error с тем же request_id.
      if (ev === 'voice:error' && data.request_id === requestId) {
        window.clearTimeout(to);
        unsub();
        reject(new Error(String(data.code ?? 'voice_signal_error')));
        return;
      }
      if (ev !== 'voice:signal') {
        return;
      }
      if (data.request_id !== requestId || data.type !== type) {
        return;
      }
      window.clearTimeout(to);
      unsub();
      if (data.ok === false) {
        const code = String(data.error ?? 'voice_signal_error');
        const detail =
          typeof data.message === 'string' && data.message.length > 0 ? `: ${data.message}` : '';
        reject(new Error(`${code}${detail}`));
        return;
      }
      resolve(data);
    });
    // Без сокета ответ не придёт: не держать вход в голос 25 с до таймаута.
    if (!send('voice:signal', { channel_id: channelId, type, payload }, requestId)) {
      window.clearTimeout(to);
      unsub();
      reject(new Error('voice_signal_offline'));
    }
  });
}

subscribeAccessTokenChange(() => {
  reidentifyOpenSocket();
});

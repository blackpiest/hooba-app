/**
 * Запасной маршрут голоса через TURN (политика `relay`).
 *
 * В части сетей (ТСПУ) ICE до mediasoup проходит, а DTLS сразу после рукопожатия закрывается:
 * клиент видит `connected`, но RTP не идёт ни в одну сторону.
 *
 * Каскад при сломанной сети с самого входа (каждый шаг — один раз):
 * 1. `direct` — обычный путь, политика `all`, сначала прямой UDP до mediasoup.
 * 2. `relay` — `turn:` по UDP и `turns:` вместе. Chrome предпочитает UDP-relay: меньше задержка, нет
 *    блокировки «голова очереди» TCP. Если UDP до TURN закрыт, ICE сам выберет `turns:`. DTLS в
 *    UDP-relay лежит внутри ChannelData со смещением, а не с начала датаграммы.
 * 3. `relay-tls` — только `turns:` (TLS 1.2 на nginx), DTLS спрятан целиком. Нужен, когда ICE через
 *    UDP-relay поднялся, а DTLS в нём всё равно режут: ICE на TLS сам не переключится.
 *
 * Ошибка 701 «Address not associated with the desired network interface» у `turns:` в Chrome обычно
 * относится ко второму интерфейсу (VPN, виртуальный адаптер), с основного аллокация проходит.
 * `turn:` по TCP не берём: DTLS там открыт, а от UDP-блокировки уже спасает `turns:`.
 */

export type VoiceIceRoute = 'direct' | 'relay' | 'relay-tls';

export type VoiceIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function urlsOf(server: VoiceIceServer): string[] {
  return Array.isArray(server.urls) ? server.urls : [server.urls];
}

function isTurnsUrl(url: unknown): boolean {
  return typeof url === 'string' && url.trim().toLowerCase().startsWith('turns:');
}

/** `turns:` (любой транспорт) или `turn:` по UDP (без `transport` — тоже UDP). */
function isRelayUrl(url: unknown): boolean {
  if (typeof url !== 'string') {
    return false;
  }
  if (isTurnsUrl(url)) {
    return true;
  }
  const value = url.trim().toLowerCase();
  if (!value.startsWith('turn:')) {
    return false;
  }
  const transport = /[?&]transport=([a-z]+)/.exec(value)?.[1];
  return transport === undefined || transport === 'udp';
}

function filterIceServers(
  servers: readonly VoiceIceServer[],
  keep: (url: unknown) => boolean,
): VoiceIceServer[] {
  const result: VoiceIceServer[] = [];
  for (const server of servers) {
    const urls = urlsOf(server).filter(keep);
    if (urls.length === 0) {
      continue;
    }
    const next: VoiceIceServer = { urls };
    if (server.username !== undefined) {
      next.username = server.username;
    }
    if (server.credential !== undefined) {
      next.credential = server.credential;
    }
    result.push(next);
  }
  return result;
}

/** URL для relay с их учётными данными: `turns:` и `turn:` по UDP; STUN и `turn:` по TCP отбрасываются. */
export function relayIceServers(servers: readonly VoiceIceServer[]): VoiceIceServer[] {
  return filterIceServers(servers, isRelayUrl);
}

/** Только `turns:` с учётными данными — для шага `relay-tls`. */
export function tlsRelayIceServers(servers: readonly VoiceIceServer[]): VoiceIceServer[] {
  return filterIceServers(servers, isTurnsUrl);
}

/** ICE-серверы для relay-маршрута; пустой список — маршрут недоступен. */
export function iceServersForRelayRoute(
  servers: readonly VoiceIceServer[],
  route: Exclude<VoiceIceRoute, 'direct'>,
): VoiceIceServer[] {
  return route === 'relay-tls' ? tlsRelayIceServers(servers) : relayIceServers(servers);
}

function countUrls(servers: readonly VoiceIceServer[]): number {
  return servers.reduce((sum, server) => sum + urlsOf(server).length, 0);
}

/**
 * Следующий шаг каскада после сломанного входа или `null`, если пробовать больше нечего.
 * `relay-tls` после `relay` — только если он отличается (в `relay` был не один `turns:`).
 */
export function nextVoiceRoute(
  route: VoiceIceRoute,
  servers: readonly VoiceIceServer[],
): VoiceIceRoute | null {
  const relay = relayIceServers(servers);
  if (route === 'direct') {
    return relay.length > 0 ? 'relay' : null;
  }
  if (route === 'relay') {
    const tls = tlsRelayIceServers(servers);
    return tls.length > 0 && countUrls(tls) < countUrls(relay) ? 'relay-tls' : null;
  }
  return null;
}

/** Состояние DTLS, при котором ICE жив, а медиа уже не пойдёт. */
export function isDtlsBroken(dtlsState: string | null): boolean {
  return dtlsState === 'closed' || dtlsState === 'failed';
}

/** Сеть, где прямой путь сломан, запоминается на сутки: после перезагрузки сразу relay. */
export const VOICE_RELAY_REMEMBER_MS = 24 * 60 * 60 * 1000;
const RELAY_UNTIL_KEY = 'hooba.voice.relayUntil';
/** Ручной тест relay только на этом клиенте: `localStorage.setItem('hooba.voice.forceRelay', '1')`. */
const FORCE_RELAY_KEY = 'hooba.voice.forceRelay';

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      globalThis.localStorage?.removeItem(key);
    } else {
      globalThis.localStorage?.setItem(key, value);
    }
  } catch {
    /* приватный режим или запрет хранилища: просто не запоминаем */
  }
}

/**
 * `forceRelay`: `1` или `relay` — шаг `relay`, `tls` — сразу `relay-tls`. Иначе `null`.
 */
export function forcedRelayRoute(): Exclude<VoiceIceRoute, 'direct'> | null {
  const raw = readStorage(FORCE_RELAY_KEY);
  if (raw === '1' || raw === 'relay') {
    return 'relay';
  }
  if (raw === 'tls') {
    return 'relay-tls';
  }
  return null;
}

export function isRelayForced(): boolean {
  return forcedRelayRoute() !== null;
}

/**
 * Запомненный для этой сети relay-маршрут или `null`.
 * Формат значения: `<until>` (старый, = `relay`) или `<until>:<route>`.
 */
export function rememberedRelayRoute(now: number = Date.now()): Exclude<VoiceIceRoute, 'direct'> | null {
  const raw = readStorage(RELAY_UNTIL_KEY);
  if (raw === null) {
    return null;
  }
  const [untilRaw, routeRaw] = raw.split(':');
  const until = Number(untilRaw);
  if (!Number.isFinite(until) || until <= now) {
    writeStorage(RELAY_UNTIL_KEY, null);
    return null;
  }
  return routeRaw === 'relay-tls' ? 'relay-tls' : 'relay';
}

export function isRelayRemembered(now: number = Date.now()): boolean {
  return rememberedRelayRoute(now) !== null;
}

export function rememberRelay(
  route: Exclude<VoiceIceRoute, 'direct'> = 'relay',
  now: number = Date.now(),
): void {
  writeStorage(RELAY_UNTIL_KEY, `${now + VOICE_RELAY_REMEMBER_MS}:${route}`);
}

export function forgetRelay(): void {
  writeStorage(RELAY_UNTIL_KEY, null);
}

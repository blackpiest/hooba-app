import type { PttCaptureEvent, PttHookResult, PttKeyBinding } from './voice-activation-prefs';
import type { VoiceOverlaySnapshot } from './voice-overlay';
import type { DesktopToast, DesktopToastInput } from './desktop-toasts';

const SERVER_URL_KEY = 'hooba_server_url';
const SERVER_HISTORY_KEY = 'hooba_server_history';
const SERVER_HISTORY_LIMIT = 8;

export type DesktopUpdateState = {
  phase: 'idle' | 'available' | 'downloading' | 'ready' | 'error';
  version: string;
  percent: number;
};

/** Заметки к релизу из билда десктопа (`desktop/release-notes.md`). */
export type DesktopReleaseNotes = {
  version: string;
  title: string;
  body: string;
};

/**
 * Ссылка hooba://register?server=…[&invite=…] или hooba://login?server=…, разобранная и проверенная в main-процессе.
 * Десктоп старше этой версии отдаёт только `{ server, invite }` без `kind` — это регистрация.
 */
export type DesktopDeepLink =
  | { kind?: "register"; server: string; invite: string }
  | { kind: "login"; server: string };

export type DesktopScreenSource = {
  id: string;
  name: string;
  kind: "screen" | "window";
  thumbnail: string;
};

declare global {
  interface Window {
    hoobaDesktop?: {
      isDesktop: boolean;
      platform?: string;
      version?: string;
      minimize?: () => void;
      toggleMaximize?: () => void;
      close?: () => void;
      onMaximizedChange?: (listener: (maximized: boolean) => void) => () => void;
      updateState?: () => Promise<DesktopUpdateState>;
      onUpdateState?: (listener: (state: DesktopUpdateState) => void) => () => void;
      onUpdateReveal?: (listener: () => void) => () => void;
      /** Нет у десктопа старше этой версии. Заметки текущей версии, если их ещё не закрывали; иначе null. */
      releaseNotes?: () => Promise<DesktopReleaseNotes | null>;
      markReleaseNotesSeen?: () => Promise<void>;
      /** Нет у десктопа старше этой версии. Забирает ссылку (приглашение или вход), пришедшую по hooba://. */
      takeDeepLink?: () => Promise<DesktopDeepLink | null>;
      /** Сигнал «пришла новая ссылка»: саму ссылку отдаёт takeDeepLink. */
      onDeepLink?: (listener: () => void) => () => void;
      downloadUpdate?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
      flushStorage?: () => void;
      openExternal?: (url: string) => Promise<void>;
      readClipboard?: () => Promise<string>;
      writeClipboard?: (text: string) => Promise<boolean>;
      /** Нет у десктопа старше этой версии. */
      writeClipboardImage?: (png: Uint8Array) => Promise<boolean>;
      systemIdleMs?: () => Promise<number>;
      matchRunningGame?: (entries: { exe: string; title: string }[]) => Promise<string | null>;
      publishVoiceOverlay?: (snapshot: VoiceOverlaySnapshot | null) => void;
      publishLiveBadge?: (active: boolean) => void;
      getVoiceOverlay?: () => Promise<VoiceOverlaySnapshot | null>;
      onVoiceOverlay?: (listener: (snapshot: VoiceOverlaySnapshot | null) => void) => () => void;
      resizeOverlay?: (height: number) => void;
      /** Нет у десктопа старше этой версии. Всплывающее уведомление, пока окно не в фокусе. */
      pushToast?: (toast: DesktopToastInput) => void;
      getToasts?: () => Promise<DesktopToast[]>;
      onToasts?: (listener: (toasts: DesktopToast[]) => void) => () => void;
      dismissToast?: (id: number) => void;
      clickToast?: (id: number) => void;
      resizeToasts?: (height: number) => void;
      onToastOpen?: (listener: (target: { channelId: number }) => void) => () => void;
      setTrayAttention?: (attention: boolean) => void;
      getOpenAtLogin?: () => Promise<boolean>;
      setOpenAtLogin?: (enabled: boolean) => Promise<boolean>;
      windowHidden?: () => Promise<boolean>;
      onWindowHidden?: (listener: (hidden: boolean) => void) => () => void;
      listScreenSources?: () => Promise<DesktopScreenSource[]>;
      prepareScreenCapture?: (sourceId: string, audio: boolean) => Promise<void>;
      setPushToTalkBinding?: (binding: PttKeyBinding | null) => Promise<PttHookResult>;
      startPushToTalkCapture?: () => Promise<PttHookResult>;
      cancelPushToTalkCapture?: () => Promise<void>;
      onPushToTalkHeld?: (listener: (held: boolean) => void) => () => void;
      onPushToTalkCapture?: (listener: (event: PttCaptureEvent) => void) => () => void;
    };
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && window.hoobaDesktop?.isDesktop === true;
}

export function getServerUrl(): string | null {
  if (!isDesktopApp()) {
    return null;
  }
  const raw = localStorage.getItem(SERVER_URL_KEY)?.trim();
  return raw ? raw : null;
}

/** Серверы, к которым уже подключались (только desktop), свежие первыми. Хранится на клиенте. */
export function getServerHistory(): string[] {
  if (!isDesktopApp()) {
    return [];
  }
  let saved: string[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SERVER_HISTORY_KEY) ?? '[]');
    saved = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    // битая запись — начинаем с пустой истории
  }
  const current = getServerUrl();
  return current && !saved.includes(current) ? [current, ...saved] : saved;
}

function rememberServer(origin: string): void {
  const next = [origin, ...getServerHistory().filter((item) => item !== origin)].slice(0, SERVER_HISTORY_LIMIT);
  localStorage.setItem(SERVER_HISTORY_KEY, JSON.stringify(next));
}

export function tokenKeySuffix(): string {
  if (!isDesktopApp()) {
    return '';
  }
  return getServerUrl() ?? '';
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/** Адреса домашней и офисной сети: к ним можно ходить по http без сертификата. */
function isPrivateLanHost(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) {
    return false;
  }
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((octet) => octet > 255)) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10 || a === 127) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return a === 172 && b >= 16 && b <= 31;
}

function allowsPlainHttp(hostname: string): boolean {
  return isLoopbackHost(hostname) || isPrivateLanHost(hostname);
}

/** Приводит ввод к origin (`https://host` или `http://127.0.0.1:3000`). */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Укажите адрес сервера');
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${guessScheme(trimmed)}://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error('Адрес сервера указан неверно');
  }
  if (url.username || url.password) {
    throw new Error('Адрес сервера не должен содержать логин и пароль');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Адрес сервера должен начинаться с https://');
  }
  if (url.protocol === 'http:' && !allowsPlainHttp(url.hostname)) {
    throw new Error('Для удалённого сервера нужен адрес https://');
  }
  return url.origin;
}

/** HTTP на адрес в локальной сети не блокируется, но токены при этом не шифруются. */
export function serverAddressWarning(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${guessScheme(trimmed)}://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || isLoopbackHost(url.hostname) || !isPrivateLanHost(url.hostname)) {
    return null;
  }
  return 'Соединение по HTTP в локальной сети. Токены входа передаются без шифрования.';
}

/** Схема по умолчанию для адреса без неё: http для localhost / LAN, иначе https. */
export function guessScheme(raw: string): 'http' | 'https' {
  const host = raw.split('/')[0] ?? raw;
  const hostname = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0];
  return allowsPlainHttp(hostname ?? '') ? 'http' : 'https';
}

/** https-ссылка на регистрацию по инвайту: десктоп берёт адрес выбранного сервера, веб — адрес страницы. */
export function buildInviteLink(code: string): string | null {
  const base = isDesktopApp() ? getServerUrl() : window.location.origin;
  return base ? `${base.replace(/\/$/, '')}/register?invite=${encodeURIComponent(code)}` : null;
}

/** Ссылка, по которой веб-страница передаёт приглашение установленному приложению. */
export function buildAppInviteLink(server: string, invite: string): string {
  const params = new URLSearchParams({ server });
  if (invite) {
    params.set('invite', invite);
  }
  return `hooba://register?${params.toString()}`;
}

/** Ссылка, по которой веб-страница входа открывает установленное приложение с подставленным адресом сервера. */
export function buildAppLoginLink(server: string): string {
  return `hooba://login?${new URLSearchParams({ server }).toString()}`;
}

export function resolveApiBase(): string {
  if (isDesktopApp()) {
    return getServerUrl() ?? '';
  }
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

/** `null` — веб-клиент, сокет считается по адресу страницы. */
export function resolveWsUrl(): string | null {
  if (!isDesktopApp()) {
    return null;
  }
  const base = getServerUrl();
  if (!base) {
    return null;
  }
  const url = new URL(base);
  const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${url.host}/ws`;
}

export async function commitServerAddress(input: string): Promise<void> {
  const origin = normalizeServerUrl(input);
  let res: Response;
  try {
    res = await fetch(`${origin}/api/v1/setup/status`);
  } catch {
    throw new Error('Сервер не отвечает. Проверьте адрес.');
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error('По этому адресу нет сервера Hooba');
  }
  const body = json as { success?: boolean };
  if (!res.ok || body.success !== true) {
    throw new Error('По этому адресу нет сервера Hooba');
  }
  localStorage.setItem(SERVER_URL_KEY, origin);
  rememberServer(origin);
}

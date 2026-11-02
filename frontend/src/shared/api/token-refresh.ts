import { apiUrl, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import {
  getAccessToken,
  getEffectiveAccessExpiresAtMs,
  getRefreshToken,
  isSessionTokenStorageKey,
  setTokens,
} from '../lib/auth-storage';
import { clearSessionClient } from '../lib/session-reset';

type TokenBundle = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
};

const DEFAULT_LEEWAY_MS = 90_000;

/** Сервер отверг сессию. Сеть, 5xx и прочий текст сюда не входят. */
const TERMINAL_AUTH_CODES = new Set([
  'UNAUTHORIZED',
  'REFRESH_INVALID',
  'ACCOUNT_DISABLED',
  'KICKED',
  'SESSION_REVOKED',
]);

export function isTerminalAuthCode(code: string): boolean {
  return TERMINAL_AUTH_CODES.has(code);
}

/** Сообщения вида `CODE: …` из `parseEnvelope` и `postRefresh`. */
export function isTerminalAuthFailure(message: string): boolean {
  const code = message.split(':')[0]?.trim() ?? '';
  return isTerminalAuthCode(code);
}

let refreshInFlight: Promise<void> | null = null;

/** Другая вкладка уже записала новую пару — эту сессию из-за отказа старого секрета не стираем. */
export function shouldClearSessionAfterRejectedRefresh(sent: string, current: string | null): boolean {
  return current === null || current === sent;
}

function waitForReplacementRefresh(previous: string, timeoutMs = 1000): Promise<string | null> {
  const current = getRefreshToken();
  if (current && current !== previous) {
    return Promise.resolve(current);
  }
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const finish = (next: string | null) => {
      window.clearTimeout(timer);
      window.removeEventListener('storage', onStorage);
      resolve(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (!isSessionTokenStorageKey(event.key)) {
        return;
      }
      const next = getRefreshToken();
      if (next && next !== previous) {
        finish(next);
      }
    };
    const timer = window.setTimeout(() => {
      const next = getRefreshToken();
      finish(next && next !== previous ? next : null);
    }, timeoutMs);
    window.addEventListener('storage', onStorage);
  });
}

async function postRefresh(refresh_token: string): Promise<TokenBundle> {
  const res = await fetch(apiUrl('/api/v1/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token }),
  });
  const json = (await parseJsonBody(res)) as ApiSuccess<TokenBundle> | ApiError;
  if (!res.ok || !json.success) {
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    const terminal = isTerminalAuthCode(code) || (res.status === 401 && !json.success);
    if (terminal) {
      const replacement = await waitForReplacementRefresh(refresh_token);
      if (replacement && !shouldClearSessionAfterRejectedRefresh(refresh_token, replacement)) {
        throw new Error('REFRESH_SUPERSEDED: another tab rotated the session');
      }
      clearSessionClient();
    }
    throw new Error(!json.success ? `${json.error.code}: ${json.error.message}` : `HTTP ${res.status}`);
  }
  return json.data;
}

/** Один запрос refresh; сессию чистим только при отказе сервера (битый refresh и т.п.). */
export async function refreshAccessTokenFromServer(): Promise<void> {
  const rt = getRefreshToken();
  if (!rt) {
    throw new Error('UNAUTHORIZED: no refresh token');
  }
  let data: TokenBundle;
  try {
    data = await postRefresh(rt);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (!message.startsWith('REFRESH_SUPERSEDED')) {
      throw error;
    }
    const next = getRefreshToken();
    if (!next || next === rt) {
      throw error;
    }
    data = await postRefresh(next);
  }
  const latest = getRefreshToken();
  if (latest && latest !== rt && latest !== data.refresh_token) {
    return;
  }
  setTokens(data.access_token, data.refresh_token, data.expires_in);
}

/**
 * Обновляет access по refresh, если до истечения осталось меньше leeway или принудительно.
 * Без refresh-токена — no-op.
 */
export async function ensureAccessTokenFresh(opts?: {
  force?: boolean;
  leewayMs?: number;
}): Promise<void> {
  const rt = getRefreshToken();
  if (!rt) {
    return;
  }
  const leeway = opts?.leewayMs ?? DEFAULT_LEEWAY_MS;
  if (!opts?.force) {
    const exp = getEffectiveAccessExpiresAtMs();
    const access = getAccessToken();
    if (access && exp !== null && Date.now() < exp - leeway) {
      return;
    }
  }
  if (refreshInFlight) {
    await refreshInFlight;
    return;
  }
  refreshInFlight = refreshAccessTokenFromServer().finally(() => {
    refreshInFlight = null;
  });
  await refreshInFlight;
}

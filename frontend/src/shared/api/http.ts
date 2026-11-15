import { getAccessToken, getRefreshToken } from '../lib/auth-storage';
import { resolveApiBase } from '../lib/server-target';

export type ApiSuccess<T> = { success: true; data: T; error: null };
export type ApiError = {
  success: false;
  data: null;
  error: { code: string; message: string };
};

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = resolveApiBase();
  return base ? `${base}${p}` : p;
}

export async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (text.trimStart().startsWith('<')) {
      throw new Error(
        'Сервер вернул HTML вместо JSON. Проверьте VITE_API_URL или proxy (vite.config).',
      );
    }
    throw new Error(`Ответ не JSON (${res.status}): ${text.slice(0, 120)}`);
  }
}

let pendingAbort = new AbortController();

/**
 * Оборвать запросы `authenticatedFetch`, которые сейчас ждут ответа (загрузка приложения зависла на сервере).
 * Refresh токена не обрывается: сервер мог уже выдать новый, и потерянный ответ разлогинил бы пользователя.
 */
export function abortPendingRequests(): void {
  pendingAbort.abort(new DOMException("Сервер не ответил вовремя", "AbortError"));
  pendingAbort = new AbortController();
}

function withPendingAbort(signal: AbortSignal | null | undefined): AbortSignal {
  if (!signal) {
    return pendingAbort.signal;
  }
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, pendingAbort.signal]) : signal;
}

/** GET/POST с Bearer; перед запросом продлевает access по refresh при необходимости; при 401 — один повтор после refresh. */
export async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { ensureAccessTokenFresh } = await import('./token-refresh.js');
  await ensureAccessTokenFresh();
  const token = getAccessToken();
  if (!token) {
    throw new Error('UNAUTHORIZED: not logged in');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const signal = withPendingAbort(init.signal);
  let res = await fetch(input, { ...init, headers, signal });
  if (res.status === 401 && getRefreshToken()) {
    try {
      await ensureAccessTokenFresh({ force: true });
    } catch {
      return res;
    }
    const t2 = getAccessToken();
    if (!t2) {
      return res;
    }
    headers.set('Authorization', `Bearer ${t2}`);
    res = await fetch(input, { ...init, headers, signal });
  }
  return res;
}

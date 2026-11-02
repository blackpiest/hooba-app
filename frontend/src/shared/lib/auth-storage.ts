import { tokenKeySuffix } from './server-target';

const ACCESS = 'hooba_access_token';
const REFRESH = 'hooba_refresh_token';
const ACCESS_EXPIRES_AT = 'hooba_access_expires_at';

function storageKey(base: string): string {
  const suffix = tokenKeySuffix();
  return suffix ? `${base}::${suffix}` : base;
}

const accessTokenListeners = new Set<() => void>();

/** Смена access в этой вкладке. Событие `storage` сюда не приходит — его шлёт только другая вкладка. */
export function subscribeAccessTokenChange(listener: () => void): () => void {
  accessTokenListeners.add(listener);
  return () => accessTokenListeners.delete(listener);
}

function notifyAccessTokenChange(): void {
  for (const listener of accessTokenListeners) {
    listener();
  }
}

export function setTokens(access: string, refresh: string, expiresInSec: number): void {
  const previous = localStorage.getItem(storageKey(ACCESS));
  localStorage.setItem(storageKey(ACCESS), access);
  localStorage.setItem(storageKey(REFRESH), refresh);
  const ms = Math.max(0, Math.floor(expiresInSec * 1000));
  localStorage.setItem(storageKey(ACCESS_EXPIRES_AT), String(Date.now() + ms));
  // Старый refresh сервер уже отозвал: новый должен попасть на диск до возможного выхода из приложения.
  window.hoobaDesktop?.flushStorage?.();
  if (previous !== access) {
    notifyAccessTokenChange();
  }
}

export function clearTokens(): void {
  localStorage.removeItem(storageKey(ACCESS));
  localStorage.removeItem(storageKey(REFRESH));
  localStorage.removeItem(storageKey(ACCESS_EXPIRES_AT));
}

/** Epoch ms; `null` если нет в storage (старые клиенты). */
export function getAccessExpiresAtMs(): number | null {
  const s = localStorage.getItem(storageKey(ACCESS_EXPIRES_AT));
  if (!s) {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function jwtExpiryMs(access: string): number | null {
  try {
    const seg = access.split('.')[1];
    if (!seg) {
      return null;
    }
    const json = JSON.parse(atob(seg.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Storage или `exp` из JWT (для сессий до появления ACCESS_EXPIRES_AT). */
export function getEffectiveAccessExpiresAtMs(): number | null {
  const fromStore = getAccessExpiresAtMs();
  if (fromStore !== null) {
    return fromStore;
  }
  const access = getAccessToken();
  if (!access) {
    return null;
  }
  return jwtExpiryMs(access);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(storageKey(ACCESS));
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(storageKey(REFRESH));
}

const SESSION_TOKEN_BASES = [ACCESS, REFRESH, ACCESS_EXPIRES_AT];

/** Ключ localStorage этой или другой вкладки, в котором лежат токены текущей сессии. */
export function isSessionTokenStorageKey(key: string | null): boolean {
  if (!key) {
    return false;
  }
  return SESSION_TOKEN_BASES.some((base) => key === base || key.startsWith(`${base}::`));
}

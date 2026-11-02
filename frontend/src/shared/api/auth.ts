import type { PresencePreference, PublicPresenceStatus } from '@/shared/presence';
import type { UserAvatar } from './avatars';
import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import { getRefreshToken, setTokens } from '../lib/auth-storage';
import { registerSessionClear, clearSessionClient } from '../lib/session-reset';

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
};

export type MeResponse = {
  id: number;
  username: string;
  display_name: string | null;
  /** Staff скрыл имя: задать новое нельзя, пока запрет не снимут. Старый сервер поле не присылает. */
  display_name_locked?: boolean;
  roles: string[];
  role_ids?: number[];
  /** Права от ролей сервера; старый сервер поле не присылает — считаем, что всё разрешено. */
  permissions?: { send_messages: boolean; speak: boolean; screen_share: boolean; attach_files?: boolean };
  server_name: string;
  /** Аватар сервера (относительный путь); null или нет поля — буква названия. */
  server_icon_url?: string | null;
  /** Рубильник личных приглашений; старый сервер поле не присылает — фича скрыта. */
  user_invites_enabled?: boolean;
  presence: PresencePreference;
  avatar: UserAvatar | null;
  badges?: string[];
  title?: string | null;
};

const ME_CLIENT_CACHE_MS = 4000;

let meClientMemory: { data: MeResponse; at: number } | null = null;
let meClientInFlight: Promise<MeResponse> | null = null;

export function resetMeClientCache(): void {
  meClientMemory = null;
  meClientInFlight = null;
}

/** Свежий ответ PATCH /me/* не должен затираться кэшированным me. */
export function patchMeClientCache(patch: Partial<MeResponse>): void {
  if (meClientMemory) {
    meClientMemory = { data: { ...meClientMemory.data, ...patch }, at: Date.now() };
  }
}

registerSessionClear(resetMeClientCache);

async function fetchMeFromNetwork(): Promise<MeResponse> {
  const res = await authenticatedFetch(apiUrl('/api/v1/auth/me'));
  return parseEnvelope<MeResponse>(res);
}

/** Схлопывает параллельные вызовы и повтор при StrictMode в пределах ME_CLIENT_CACHE_MS. */
export async function fetchMe(): Promise<MeResponse> {
  if (meClientMemory && Date.now() - meClientMemory.at < ME_CLIENT_CACHE_MS) {
    return meClientMemory.data;
  }
  if (meClientInFlight) {
    return meClientInFlight;
  }
  meClientInFlight = fetchMeFromNetwork()
    .then((data) => {
      meClientMemory = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      meClientInFlight = null;
    });
  return meClientInFlight;
}

export async function updateMyPresence(
  status: PresencePreference,
): Promise<{ presence: PresencePreference; status: PublicPresenceStatus }> {
  const res = await authenticatedFetch(apiUrl('/api/v1/me/presence'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const data = await parseEnvelope<{ presence: PresencePreference; status: PublicPresenceStatus }>(res);
  patchMeClientCache({ presence: data.presence });
  return data;
}

export async function login(username: string, password: string): Promise<TokenResponse> {
  const res = await fetch(apiUrl('/api/v1/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseEnvelope<TokenResponse>(res);
  resetMeClientCache();
  setTokens(data.access_token, data.refresh_token, data.expires_in);
  return data;
}

export async function register(
  invite_code: string,
  username: string,
  password: string,
): Promise<TokenResponse> {
  const res = await fetch(apiUrl('/api/v1/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code, username, password }),
  });
  const data = await parseEnvelope<TokenResponse>(res);
  resetMeClientCache();
  setTokens(data.access_token, data.refresh_token, data.expires_in);
  return data;
}

export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  clearSessionClient();
  if (!refresh) {
    return;
  }
  try {
    const res = await fetch(apiUrl('/api/v1/auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    await parseEnvelope<{ ok: true }>(res);
  } catch {
    /* сеть / уже отозвано — локальная сессия уже сброшена */
  }
}

export async function createInvite(): Promise<{ id: number; code: string; expires_at: string | null }> {
  const res = await authenticatedFetch(apiUrl('/api/v1/invites'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return parseEnvelope(res);
}

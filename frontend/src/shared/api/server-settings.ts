import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';

/**
 * `timezone` — пояс сообщества (IANA): по нему испытания считают дни и окна.
 * `server_icon_url` — аватар сервера (относительный путь, неизменный); null — нет.
 */
export type ServerSettings = { user_invites_enabled: boolean; timezone?: string; server_icon_url?: string | null };

/** Синхронно с backend `image-pipeline.ts` (аватар сервера). */
export const MAX_SERVER_ICON_UPLOAD_BYTES = 2 * 1024 * 1024;
export const SERVER_ICON_MIN_SIDE = 64;
export const SERVER_ICON_MAX_INPUT_SIDE = 4096;
export const SERVER_ICON_ACCEPT = 'image/png,image/jpeg,image/webp';

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : res.status === 413 ? 'FILE_TOO_LARGE' : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

export async function fetchServerSettings(): Promise<ServerSettings> {
  return parseEnvelope<ServerSettings>(await authenticatedFetch(apiUrl('/api/v1/server-settings')));
}

export async function patchServerSettings(patch: Partial<ServerSettings>): Promise<ServerSettings> {
  const res = await authenticatedFetch(apiUrl('/api/v1/server-settings'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return parseEnvelope<ServerSettings>(res);
}

export async function uploadServerIcon(file: File): Promise<{ server_icon_url: string | null }> {
  const body = new FormData();
  body.append('file', file, file.name || 'icon.png');
  const res = await authenticatedFetch(apiUrl('/api/v1/server-settings/icon'), { method: 'PUT', body });
  return parseEnvelope<{ server_icon_url: string | null }>(res);
}

export async function removeServerIcon(): Promise<{ server_icon_url: string | null }> {
  const res = await authenticatedFetch(apiUrl('/api/v1/server-settings/icon'), { method: 'DELETE' });
  return parseEnvelope<{ server_icon_url: string | null }>(res);
}

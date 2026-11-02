import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

function authJson(method: string, path: string, body: unknown): Promise<Response> {
  return authenticatedFetch(apiUrl(path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function postModerationBan(userId: number, reason?: string): Promise<void> {
  const res = await authJson('POST', '/api/v1/moderation/ban', {
    user_id: userId,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  });
  await parseEnvelope<{ ok: true }>(res);
}

export async function postModerationKick(userId: number, reason?: string): Promise<void> {
  const res = await authJson('POST', '/api/v1/moderation/kick', {
    user_id: userId,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  });
  await parseEnvelope<{ ok: true }>(res);
}

export async function postModerationWarn(userId: number, reason?: string): Promise<void> {
  const res = await authJson('POST', '/api/v1/moderation/warn', {
    user_id: userId,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  });
  await parseEnvelope<{ ok: true }>(res);
}

/** Скрыть отображаемое имя (стирается, новое задать нельзя) или снять запрет. */
export async function postDisplayNameLock(userId: number, locked: boolean, reason?: string): Promise<void> {
  const res = await authJson('POST', `/api/v1/moderation/display-name/${locked ? 'hide' : 'unhide'}`, {
    user_id: userId,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  });
  await parseEnvelope<{ ok: true }>(res);
}

export type ModerationLogRow = {
  id: number;
  actor_id: number;
  actor_username: string;
  target_user_id: number | null;
  target_username: string | null;
  action: string;
  reason: string | null;
  channel_id: number | null;
  created_at: string;
};

export async function fetchModerationLogs(offset = 0, limit = 30): Promise<ModerationLogRow[]> {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const res = await authenticatedFetch(apiUrl(`/api/v1/moderation/logs?${q}`));
  return parseEnvelope<ModerationLogRow[]>(res);
}

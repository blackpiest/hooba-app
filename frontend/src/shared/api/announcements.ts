import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import { shareInFlight } from './in-flight';

export const ANNOUNCEMENT_TITLE_MAX = 100;
export const ANNOUNCEMENT_BODY_MAX = 4000;

/** Местное время сообщества `YYYY-MM-DDTHH:mm` (пояс — `ServerSettings.timezone`). */
export type LocalMinute = string;

export type AnnouncementInput = {
  title: string;
  body: string;
  show_at: LocalMinute;
  expires_at: LocalMinute | null;
  /** Пустые `role_ids` и `user_ids` — всем; иначе объединение. */
  role_ids: number[];
  user_ids: number[];
};

export type AnnouncementRow = AnnouncementInput & {
  id: number;
  /** Когда наступила дата и зафиксированы получатели; после этого правка запрещена. */
  delivered_at: string | null;
  created_at: string;
  recipients_count: number;
  seen_count: number;
};

export type PendingAnnouncement = { id: number; title: string; body: string; show_at: LocalMinute };

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

/** Мои непрочитанные объявления, дата которых наступила. */
export function fetchPendingAnnouncements(): Promise<PendingAnnouncement[]> {
  return shareInFlight('announcements:pending', async () => {
    const res = await authenticatedFetch(apiUrl('/api/v1/announcements/pending'));
    return parseEnvelope<PendingAnnouncement[]>(res);
  });
}

export async function markAnnouncementSeen(id: number): Promise<void> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/announcements/${id}/seen`), { method: 'POST' });
  await parseEnvelope<{ ok: true }>(res);
}

export function fetchAnnouncements(): Promise<AnnouncementRow[]> {
  return shareInFlight('announcements:list', async () => {
    const res = await authenticatedFetch(apiUrl('/api/v1/announcements'));
    return parseEnvelope<AnnouncementRow[]>(res);
  });
}

export async function saveAnnouncement(id: number | null, input: AnnouncementInput): Promise<AnnouncementRow> {
  const res = await authenticatedFetch(apiUrl(id === null ? '/api/v1/announcements' : `/api/v1/announcements/${id}`), {
    method: id === null ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseEnvelope<AnnouncementRow>(res);
}

export async function deleteAnnouncement(id: number): Promise<void> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/announcements/${id}`), { method: 'DELETE' });
  await parseEnvelope<{ ok: true }>(res);
}

import type { PublicPresenceStatus } from '@/shared/presence';
import type { UserAvatar } from './avatars';
import { patchMeClientCache } from './auth';
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

export type UserDirectoryEntry = {
  id: number;
  username: string;
  /** null — показывать username. */
  display_name: string | null;
  /** Staff скрыл имя: задать новое нельзя, пока запрет не снимут. Старый сервер поле не присылает. */
  display_name_locked?: boolean;
  /** Ключи системных ролей (OWNER | ADMIN | MEMBER). */
  roles: string[];
  /** Все роли участника, включая кастомные. Старый сервер поле не присылает. */
  role_ids?: number[];
  status: PublicPresenceStatus;
  is_online: boolean;
  last_seen_at: string | null;
  game: string | null;
  avatar: UserAvatar | null;
  /** Закреплённые значки (до 3, по порядку) и титул; старый сервер полей не присылает. */
  badges?: string[];
  title?: string | null;
};

export async function fetchUsersDirectory(): Promise<UserDirectoryEntry[]> {
  const res = await authenticatedFetch(apiUrl('/api/v1/users'));
  return parseEnvelope<UserDirectoryEntry[]>(res);
}

/** null или пустая строка — сбросить на username. */
export async function updateMyDisplayName(displayName: string | null): Promise<{ display_name: string | null }> {
  const res = await authenticatedFetch(apiUrl('/api/v1/me/profile'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName }),
  });
  const data = await parseEnvelope<{ display_name: string | null }>(res);
  patchMeClientCache({ display_name: data.display_name });
  return data;
}

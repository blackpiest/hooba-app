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

/** true — разрешено. */
export type RolePermissions = {
  send_messages: boolean;
  speak: boolean;
  screen_share: boolean;
  /** Старый сервер поле не присылает. */
  attach_files?: boolean;
};

export type RoleRow = {
  id: number;
  /** Неизменный ключ системной роли (OWNER | ADMIN | MEMBER); null у кастомных. Имя — только для показа. */
  key: string | null;
  name: string;
  /** `#rrggbb` или null — без цвета. */
  color: string | null;
  position: number;
  is_system: boolean;
  /** Участники с ролью — отдельной группой в списке «Онлайн». Старый сервер поле не присылает. */
  hoist?: boolean;
  /** Значок роли (id из каталога косметики): есть у всех носителей. Старый сервер поле не присылает. */
  badge_id?: string | null;
  /** Старый сервер поле не присылает. */
  permissions?: RolePermissions;
};

export type RoleAssignment = {
  user_id: number;
  /** Ключи системных ролей. */
  roles: string[];
  role_ids: number[];
};

export async function fetchRoles(): Promise<RoleRow[]> {
  const res = await authenticatedFetch(apiUrl('/api/v1/roles'));
  return parseEnvelope<RoleRow[]>(res);
}

export async function assignRole(roleId: number, userId: number): Promise<RoleAssignment> {
  const res = await authJson('POST', `/api/v1/roles/${roleId}/assign`, { user_id: userId });
  return parseEnvelope<RoleAssignment>(res);
}

export async function removeRole(roleId: number, userId: number): Promise<RoleAssignment> {
  const res = await authJson('POST', `/api/v1/roles/${roleId}/remove`, { user_id: userId });
  return parseEnvelope<RoleAssignment>(res);
}

export async function createRole(input: { name: string; color: string | null }): Promise<RoleRow> {
  const res = await authJson('POST', '/api/v1/roles', input);
  return parseEnvelope<RoleRow>(res);
}

export async function updateRole(
  roleId: number,
  patch: {
    name?: string;
    color?: string | null;
    permissions?: Partial<RolePermissions>;
    hoist?: boolean;
    badge_id?: string | null;
  },
): Promise<RoleRow> {
  const res = await authJson('PATCH', `/api/v1/roles/${roleId}`, patch);
  return parseEnvelope<RoleRow>(res);
}

export async function deleteRole(roleId: number): Promise<void> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/roles/${roleId}`), { method: 'DELETE' });
  await parseEnvelope<{ id: number }>(res);
}

/** `roleIds` — все роли, кроме MEMBER (она всегда снизу), в новом порядке; ответ — весь каталог. */
export async function reorderRoles(roleIds: number[]): Promise<RoleRow[]> {
  const res = await authJson('PATCH', '/api/v1/roles/order', { role_ids: roleIds });
  return parseEnvelope<RoleRow[]>(res);
}

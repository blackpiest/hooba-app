import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import { shareInFlight } from './in-flight';

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

export type StaffInviteRow = {
  id: number;
  code: string;
  is_revoked: boolean;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
  created_by_username: string;
};

export async function fetchStaffInvites(): Promise<StaffInviteRow[]> {
  const res = await authenticatedFetch(apiUrl('/api/v1/invites'));
  return parseEnvelope<StaffInviteRow[]>(res);
}

export async function revokeStaffInvite(inviteId: number): Promise<void> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/invites/${inviteId}`), {
    method: 'DELETE',
  });
  await parseEnvelope<{ ok: true }>(res);
}

export type MyInviteRow = {
  id: number;
  slot: number;
  code: string;
  status: 'active' | 'used' | 'revoked';
  used_at: string | null;
  used_by: { id: number; username: string; display_name: string | null } | null;
};

export type MyInvites = { enabled: boolean; invites: MyInviteRow[] };

export function fetchMyInvites(): Promise<MyInvites> {
  return shareInFlight('me:invites', async () => {
    const res = await authenticatedFetch(apiUrl('/api/v1/me/invites'));
    return parseEnvelope<MyInvites>(res);
  });
}

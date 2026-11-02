import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import { shareInFlight } from './in-flight';

export const REPORT_REASON_MAX = 500;

export type ReportUser = {
  id: number;
  username: string;
  display_name: string | null;
};

export type ReportRow = {
  id: number;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  reporter: ReportUser;
  /** `role_keys` — системные роли цели: жалобу на OWNER/ADMIN рассматривает только OWNER. */
  target: ReportUser & { role_keys: string[] };
  resolved_by: ReportUser | null;
};

export type ReportStatus = 'open' | 'resolved';

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

export async function postReport(userId: number, reason: string): Promise<void> {
  const res = await authenticatedFetch(apiUrl('/api/v1/reports'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, reason }),
  });
  await parseEnvelope<{ ok: true }>(res);
}

/** На кого у меня сейчас есть открытая жалоба. */
export function fetchMyOpenReportTargets(): Promise<number[]> {
  return shareInFlight('reports:mine', async () => {
    const res = await authenticatedFetch(apiUrl('/api/v1/reports/mine'));
    return (await parseEnvelope<{ target_user_ids: number[] }>(res)).target_user_ids;
  });
}

export function fetchReports(status: ReportStatus, offset: number, limit: number): Promise<ReportRow[]> {
  const params = new URLSearchParams({ status, offset: String(offset), limit: String(limit) });
  return shareInFlight(`reports:${params.toString()}`, async () => {
    const res = await authenticatedFetch(apiUrl(`/api/v1/reports?${params.toString()}`));
    return parseEnvelope<ReportRow[]>(res);
  });
}

export function fetchOpenReportsCount(): Promise<number> {
  return shareInFlight('reports:open-count', async () => {
    const res = await authenticatedFetch(apiUrl('/api/v1/reports/open-count'));
    return (await parseEnvelope<{ count: number }>(res)).count;
  });
}

export async function resolveReport(reportId: number): Promise<void> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/reports/${reportId}/resolve`), { method: 'POST' });
  await parseEnvelope<{ ok: true }>(res);
}

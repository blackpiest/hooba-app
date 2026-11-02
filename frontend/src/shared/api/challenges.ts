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

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const init: RequestInit =
    body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  return parseEnvelope<T>(await authenticatedFetch(apiUrl(path), init));
}

export type CosmeticKind = 'badge' | 'title' | 'frame' | 'background' | 'character';
export type CosmeticReward = { kind: CosmeticKind; id: string };

/** Местное время сообщества с точностью до часа: `2026-10-31T20:00`. */
export type LocalHour = string;
type Period = { from?: LocalHour; to?: LocalHour };

/** Условия испытаний (зеркало `backend/src/modules/challenges/challenge-schema.ts`). */
export type Condition =
  | ({ type: 'messages'; count: number; channel_ids?: number[] } & Period)
  | ({ type: 'voice_minutes'; minutes: number; channel_ids?: number[] } & Period)
  | ({ type: 'game_minutes'; minutes: number; games?: string[] } & Period)
  | { type: 'online_minutes'; minutes: number; from: LocalHour; to: LocalHour }
  | ({ type: 'active_days'; days: number } & Period)
  | { type: 'streak_days'; days: number }
  | { type: 'invites_joined'; count: number }
  | { type: 'has_cosmetic'; kind: CosmeticKind; item_id: string }
  | { type: 'challenge_done'; challenge_id: number };

export type ConditionType = Condition['type'];
export type ConditionGroup = { op: 'all' | 'any'; items: ConditionNode[] };
export type ConditionNode = Condition | ConditionGroup;

export function isConditionGroup(node: ConditionNode): node is ConditionGroup {
  return 'op' in node;
}

export type LeafProgress = { condition: Condition; current: number; target: number; done: boolean };
export type GroupProgress = { op: 'all' | 'any'; ratio: number; done: boolean; items: NodeProgress[] };
export type NodeProgress = LeafProgress | GroupProgress;

export type ChallengeStatus = 'draft' | 'active' | 'archived';

export type Challenge = {
  id: number;
  title: string;
  description: string;
  status: ChallengeStatus;
  /** null — условие в БД не проходит текущую схему (испытание не засчитывается). */
  condition: ConditionGroup | null;
  rewards: CosmeticReward[];
  starts_at: LocalHour | null;
  ends_at: LocalHour | null;
  published_at: string | null;
  completions: number;
};

export type MyChallenge = Omit<Challenge, 'published_at' | 'completions'> & {
  /** Окно по часам сообщества: ещё не началось, идёт, закончилось (или испытание в архиве). */
  window: 'upcoming' | 'open' | 'ended';
  completed_at: string | null;
  progress: GroupProgress | null;
};

export type ChallengeInput = {
  title: string;
  description: string;
  condition: ConditionGroup;
  rewards: CosmeticReward[];
  starts_at: LocalHour | null;
  ends_at: LocalHour | null;
};

export const fetchMyChallenges = () => request<MyChallenge[]>('/api/v1/me/challenges');
export const fetchChallenges = () => request<Challenge[]>('/api/v1/challenges');
export const createChallenge = (input: ChallengeInput) => request<Challenge>('/api/v1/challenges', 'POST', input);
export const updateChallenge = (id: number, patch: Partial<ChallengeInput>) =>
  request<Challenge>(`/api/v1/challenges/${id}`, 'PATCH', patch);
export const deleteChallenge = (id: number) => request<{ deleted: true }>(`/api/v1/challenges/${id}`, 'DELETE');
export const publishChallenge = (id: number) => request<Challenge>(`/api/v1/challenges/${id}/publish`, 'POST', {});
export const archiveChallenge = (id: number) => request<Challenge>(`/api/v1/challenges/${id}/archive`, 'POST', {});

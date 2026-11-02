import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import type { CosmeticKind } from './challenges';

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

/** Сколько значков можно закрепить на карточке (зеркало `PINNED_BADGES_MAX` на сервере). */
export const PINNED_BADGES_MAX = 3;

/** `role` — от роли (у владельца так помечено всё); `manual` — выдал владелец; `challenge` — за испытание; `legacy` — носил до того, как предмет стал наградой. */
export type OwnedSource = 'role' | 'manual' | 'challenge' | 'legacy';
/** `new` — метка «Новое» в конструкторе: выдано, а я ещё не нажимал на предмет (снимает `markCosmeticSeen`). */
export type OwnedBadge = { id: string; source: OwnedSource; granted_at: string; new?: true };
export type OwnedTitle = { id: string; source?: OwnedSource; granted_at: string; new?: true };
/** Рамки, фоны, персонажи сверх открытых всем. */
export type OwnedItem = { kind: 'frame' | 'background' | 'character'; id: string; source: OwnedSource; granted_at: string; new?: true };

/** Что есть у пользователя и что сейчас на витрине. */
export type UserCosmetics = {
  badges: OwnedBadge[];
  titles: OwnedTitle[];
  /** Старый сервер поле не присылает. */
  items?: OwnedItem[];
  pinned_badges: string[];
  title: string | null;
};

/** Витрина: закреплённые значки по порядку и титул. */
export type Showcase = { badges: string[]; title: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authenticatedFetch(apiUrl(path), init);
  return parseEnvelope<T>(res);
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export function fetchMyCosmetics(): Promise<UserCosmetics> {
  return request('/api/v1/me/cosmetics');
}

/** Нажал на новый предмет в конструкторе: метка «Новое» больше не показывается. */
export async function markCosmeticSeen(kind: CosmeticKind, id: string): Promise<void> {
  await request('/api/v1/me/cosmetics/seen', jsonInit('POST', { kind, id }));
}

export function updateMyShowcase(showcase: Showcase): Promise<{ pinned_badges: string[]; title: string | null }> {
  return request('/api/v1/me/showcase', jsonInit('PATCH', { pinned_badges: showcase.badges, title: showcase.title }));
}

/** Только для владельца. */
export function fetchUserCosmetics(userId: number): Promise<UserCosmetics> {
  return request(`/api/v1/users/${userId}/cosmetics`);
}

/** Любой вид косметики (закрытую рамку можно подарить). */
export function grantCosmetic(userId: number, kind: OwnedItem['kind'] | 'badge' | 'title', id: string): Promise<UserCosmetics> {
  return request(`/api/v1/users/${userId}/cosmetics`, jsonInit('POST', { kind, id }));
}

export function revokeCosmetic(userId: number, kind: OwnedItem['kind'] | 'badge' | 'title', id: string): Promise<UserCosmetics> {
  return request(`/api/v1/users/${userId}/cosmetics/${kind}/${encodeURIComponent(id)}`, jsonInit('DELETE'));
}

export function grantBadge(userId: number, badgeId: string): Promise<UserCosmetics> {
  return request(`/api/v1/users/${userId}/badges`, jsonInit('POST', { badge_id: badgeId }));
}

export function revokeBadge(userId: number, badgeId: string): Promise<UserCosmetics> {
  return request(`/api/v1/users/${userId}/badges/${encodeURIComponent(badgeId)}`, jsonInit('DELETE'));
}

export function grantTitle(userId: number, titleId: string): Promise<UserCosmetics> {
  return request(`/api/v1/users/${userId}/titles`, jsonInit('POST', { title_id: titleId }));
}

export function revokeTitle(userId: number, titleId: string): Promise<UserCosmetics> {
  return request(`/api/v1/users/${userId}/titles/${encodeURIComponent(titleId)}`, jsonInit('DELETE'));
}

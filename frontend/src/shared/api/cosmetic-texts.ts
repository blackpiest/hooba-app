import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import type { BadgeCategory, BadgeIconSpec } from '@/shared/ui/profile-card';

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const init: RequestInit =
    body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await authenticatedFetch(apiUrl(path), init);
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

export type BadgeTexts = { name: string; description: string; category: BadgeCategory; hint: string | null };
/** `badge` — значок, чья иконка рисуется рядом; null — без иконки. */
export type TitleTexts = { label: string; badge: string | null };

/**
 * Витрина или запас: `listed: false` — «в запасе», в конструкторе виден только получившим.
 * `listed_default` — как в каталоге (у своих титулов null).
 */
export type CosmeticListed = { listed: boolean; listed_default: boolean | null };

/** Вид косметики в API. */
export type CosmeticKind = 'badge' | 'title' | 'frame' | 'background' | 'character';

/** `custom` — создан владельцем (удаляется насовсем), `catalog` — из каталога сервера (только скрывается). */
export type CosmeticTitle = CosmeticListed & {
  id: string;
  source: 'catalog' | 'custom';
  hidden: boolean;
  /** Как в каталоге; у своих — null. */
  defaults: TitleTexts | null;
  override: TitleTexts | null;
  current: TitleTexts;
  /** У скольких участников выдан. */
  holders: number;
};

/** Витрина (только OWNER): значения каталога и правки владельца по отдельности. `override: null` — как в каталоге. */
export type CosmeticTexts = {
  badges: (CosmeticListed & { id: string; icon: BadgeIconSpec; defaults: BadgeTexts; override: BadgeTexts | null })[];
  titles: CosmeticTitle[];
  /** Рамки, фоны, персонажи: только витрина/запас (превью — по каталогу из `avatar-store`). Старый сервер не присылает. */
  items?: (CosmeticListed & { kind: 'frame' | 'background' | 'character'; id: string; label: string })[];
};

/** URL иконок приходят относительными (desktop открыт на app://hooba). */
function withAbsoluteIcons(data: CosmeticTexts): CosmeticTexts {
  return {
    ...data,
    badges: data.badges.map((badge) => ('url' in badge.icon ? { ...badge, icon: { url: apiUrl(badge.icon.url) } } : badge)),
  };
}

export const fetchCosmeticTexts = () => request<CosmeticTexts>('/api/v1/cosmetics/texts').then(withAbsoluteIcons);
export const saveBadgeTexts = (id: string, texts: BadgeTexts) =>
  request<CosmeticTexts>(`/api/v1/cosmetics/texts/badge/${encodeURIComponent(id)}`, 'PUT', texts).then(withAbsoluteIcons);
export const saveTitleTexts = (id: string, texts: TitleTexts) =>
  request<CosmeticTexts>(`/api/v1/cosmetics/texts/title/${encodeURIComponent(id)}`, 'PUT', texts).then(withAbsoluteIcons);
export const createTitle = (texts: TitleTexts) =>
  request<CosmeticTexts>('/api/v1/cosmetics/titles', 'POST', texts).then(withAbsoluteIcons);
/** Свой титул удаляется вместе с выдачами, каталожный — скрывается. */
export const deleteTitle = (id: string) =>
  request<CosmeticTexts>(`/api/v1/cosmetics/titles/${encodeURIComponent(id)}`, 'DELETE').then(withAbsoluteIcons);
export const restoreTitle = (id: string) =>
  request<CosmeticTexts>(`/api/v1/cosmetics/titles/${encodeURIComponent(id)}/restore`, 'POST', {}).then(withAbsoluteIcons);
/** Витрина (`true`) или запас. Выдачи остаются; надетую рамку, фон, персонажа носившие сохраняют. */
export const setCosmeticListed = (kind: CosmeticKind, id: string, listed: boolean) =>
  request<CosmeticTexts>(`/api/v1/cosmetics/listed/${kind}/${encodeURIComponent(id)}`, 'PUT', { listed }).then(withAbsoluteIcons);
export const resetCosmeticTexts = (kind: 'badge' | 'title', id: string) =>
  request<CosmeticTexts>(`/api/v1/cosmetics/texts/${kind}/${encodeURIComponent(id)}`, 'DELETE').then(withAbsoluteIcons);

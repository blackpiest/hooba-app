import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import { shareInFlight } from './in-flight';
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

/**
 * Что появилось в конструкторе профиля после последнего просмотра: выданная мне косметика, новые испытания
 * и выполненные мной испытания (`completed` — свежие первыми, до 5 названий; всего — `completed_count`).
 */
export type ProfileNews = {
  cosmetics: number;
  /** Вид самого свежего нового предмета (подсказка ведёт на его вкладку); null — новых предметов нет. */
  cosmetic_kind: CosmeticKind | null;
  challenges: number;
  /** Новые испытания — метка «Новое» во вкладке «Испытания». Старый сервер поле не присылает. */
  challenge_ids?: number[];
  completed: { id: number; title: string }[];
  completed_count: number;
};

export function fetchProfileNews(): Promise<ProfileNews> {
  return shareInFlight('profile-news', async () => {
    const res = await authenticatedFetch(apiUrl('/api/v1/me/profile-news'));
    return parseEnvelope<ProfileNews>(res);
  });
}

export async function markProfileNewsSeen(): Promise<void> {
  const res = await authenticatedFetch(apiUrl('/api/v1/me/profile-news/seen'), { method: 'POST' });
  await parseEnvelope<{ ok: true }>(res);
}

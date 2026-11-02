import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import { patchMeClientCache } from './auth';
import type { BackgroundSpec, BadgeSpec, FrameSpec, TitleSpec } from '@/shared/ui/profile-card';

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

/** Косметика профиля: id из каталога, null — «нет» (буква / цвет бренда / базовая рамка). `null` целиком — ничего не выбрано. */
export type UserAvatar = { character: string | null; background: string | null; frame: string | null };

/** Idle-спрайт персонажа: лента кадров, порядок показа и скорость. */
export type AvatarCharacterIdle = { url: string; frames: number; fps: number; sequence: number[] };

/**
 * Витрина или запас: `listed: false` — предмет «в запасе», в конструкторе виден только получившим.
 * Старый сервер поля не присылает — всё на витрине.
 */
export type CosmeticListed = { listed?: boolean };

/**
 * Доступ к предмету: `locked` — надеть нельзя (награда испытания или запас);
 * `challenge_ids` — испытания, которые его дают. Старый сервер полей не присылает — всё открыто.
 */
export type CosmeticLock = { locked?: boolean; challenge_ids?: number[] } & CosmeticListed;

/** Персонаж: имя для подсказки, полный рост для карточки профиля, кроп головы для маленьких аватаров, необязательный idle-спрайт. */
export type AvatarCharacter = {
  id: string;
  name: string;
  url: string;
  head_url: string;
  idle?: AvatarCharacterIdle | null;
} & CosmeticLock;

/** Рамка из каталога (спека для отрисовки). */
export type AvatarFrame = FrameSpec & CosmeticLock;

/** Фон из каталога: спека для отрисовки, у слоёв-картинок `url` уже абсолютный. */
export type AvatarBackground = BackgroundSpec & CosmeticLock;

/** Фоны и рамки описаны данными: клиент рисует их по спеке, новые не требуют обновления клиента. */
export type AvatarCatalog = {
  version: string;
  characters: AvatarCharacter[];
  backgrounds: AvatarBackground[];
  frames: AvatarFrame[];
  /** Значки и титулы; старый сервер полей не присылает. */
  badges: (BadgeSpec & CosmeticListed)[];
  titles: (TitleSpec & CosmeticListed)[];
};

/** URL файлов приходят относительными: в desktop страница на app://hooba, картинки — с сервера. */
export async function fetchAvatarCatalog(): Promise<AvatarCatalog> {
  const res = await authenticatedFetch(apiUrl('/api/v1/avatars'));
  const data = await parseEnvelope<AvatarCatalog>(res);
  return {
    ...data,
    characters: data.characters.map((item) => ({
      ...item,
      url: apiUrl(item.url),
      head_url: apiUrl(item.head_url),
      idle: item.idle ? { ...item.idle, url: apiUrl(item.idle.url) } : null,
    })),
    backgrounds: data.backgrounds.map((item) => ({
      ...item,
      layers: item.layers.map((layer) => ('url' in layer ? { ...layer, url: apiUrl(layer.url) } : layer)),
    })),
    badges: (data.badges ?? []).map((item) => ('url' in item.icon ? { ...item, icon: { url: apiUrl(item.icon.url) } } : item)),
    titles: data.titles ?? [],
  };
}

export async function updateMyAvatar(avatar: UserAvatar | null): Promise<{ avatar: UserAvatar | null }> {
  const res = await authenticatedFetch(apiUrl('/api/v1/me/avatar'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar }),
  });
  const data = await parseEnvelope<{ avatar: UserAvatar | null }>(res);
  patchMeClientCache({ avatar: data.avatar });
  return data;
}

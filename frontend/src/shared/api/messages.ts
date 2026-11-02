import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';
import { shareInFlight } from './in-flight';
import type { AttachmentDto } from './attachments';

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await parseJsonBody(res)) as ApiSuccess<T> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

/** Реакция: unicode-эмодзи или `c:<id>` смайлика сообщества; `user_ids` — в порядке, в каком ставили. */
export type ReactionDto = {
  emoji: string;
  custom_emoji_id: number | null;
  count: number;
  user_ids: number[];
};

export type MessageDto = {
  id: number;
  channel_id: number;
  author_id: number;
  author_username: string;
  content: string;
  /** Картинки (до 4). Текст при них может быть пустым. */
  attachments?: AttachmentDto[];
  reactions?: ReactionDto[];
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export function fetchChannelMessages(
  channelId: number,
  offset = 0,
  limit = 50,
  before?: { createdAt: string; id: number },
): Promise<MessageDto[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (before) {
    q.set('before_created_at', before.createdAt);
    q.set('before_id', String(before.id));
  } else {
    q.set('offset', String(offset));
  }
  return shareInFlight(`messages:${channelId}:${q}`, async () => {
    const res = await authenticatedFetch(apiUrl(`/api/v1/channels/${channelId}/messages?${q}`));
    return parseEnvelope<MessageDto[]>(res);
  });
}

/** Закреплённое сообщение канала; `message: null` — ничего не закреплено. */
export type ChannelPinDto = {
  channel_id: number;
  message: MessageDto | null;
  pinned_by_id: number | null;
  pinned_at: string | null;
};

export function fetchChannelPin(channelId: number): Promise<ChannelPinDto> {
  return shareInFlight(`pin:${channelId}`, async () => {
    const res = await authenticatedFetch(apiUrl(`/api/v1/channels/${channelId}/pin`));
    return parseEnvelope<ChannelPinDto>(res);
  });
}

/** Только OWNER/ADMIN. Прежний закреп канала заменяется; всем в канале приходит `channel:pin`. */
export async function pinMessage(messageId: number): Promise<ChannelPinDto> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/messages/${messageId}/pin`), { method: 'PUT' });
  return parseEnvelope<ChannelPinDto>(res);
}

export async function unpinChannel(channelId: number): Promise<ChannelPinDto> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/channels/${channelId}/pin`), { method: 'DELETE' });
  return parseEnvelope<ChannelPinDto>(res);
}

export type MessageReactionsDto = { message_id: number; channel_id: number; reactions: ReactionDto[] };

/** Поставить (`on`) или снять реакцию. Ответ — актуальный список реакций сообщения. */
export async function setMessageReaction(messageId: number, emoji: string, on: boolean): Promise<MessageReactionsDto> {
  const res = await authenticatedFetch(
    apiUrl(`/api/v1/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`),
    { method: on ? 'PUT' : 'DELETE' },
  );
  return parseEnvelope<MessageReactionsDto>(res);
}

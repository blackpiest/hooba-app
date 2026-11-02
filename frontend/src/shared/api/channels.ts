import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';

export type ChannelDto = {
  id: number;
  name: string;
  channel_type: string;
  position: number;
  is_private: boolean;
  created_at: string;
  updated_at: string;
  /** Только GET канала для администратора. */
  member_user_ids?: number[];
  /** Что текущему участнику можно в этом канале (роли + ограничения канала). Старый сервер не присылает. */
  my_permissions?: {
    send_messages: boolean;
    speak: boolean;
    screen_share: boolean;
    attach_files?: boolean;
    react?: boolean;
  };
  /** Роли, которые видят приватный канал; только для администратора. */
  view_role_ids?: number[];
  /** Ограничения канала, только для администратора: null — всем, массив — выбранным ролям. */
  send_role_ids?: number[] | null;
  speak_role_ids?: number[] | null;
  stream_role_ids?: number[] | null;
  attach_role_ids?: number[] | null;
  react_role_ids?: number[] | null;
  /** Участники, которым реакции открыты вдобавок к ролям (только при ограничении). */
  react_user_ids?: number[];
};

export type ChannelWriteInput = {
  name: string;
  is_private: boolean;
  member_user_ids?: number[];
  view_role_ids?: number[];
  send_role_ids?: number[] | null;
  speak_role_ids?: number[] | null;
  stream_role_ids?: number[] | null;
  attach_role_ids?: number[] | null;
  react_role_ids?: number[] | null;
  /** Участники, которым реакции открыты вдобавок к ролям (только при ограничении). */
  react_user_ids?: number[];
};

function parseOk<T>(res: Response, json: unknown): T {
  const body = json as ApiSuccess<T> | ApiError;
  if (!res.ok || !body.success) {
    const msg = !body.success ? body.error.message : `HTTP ${res.status}`;
    const code = !body.success ? body.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return body.data;
}

export async function fetchChannels(): Promise<ChannelDto[]> {
  const res = await authenticatedFetch(apiUrl('/api/v1/channels'));
  const json = await parseJsonBody(res);
  return parseOk<ChannelDto[]>(res, json);
}

export async function createChannelApi(
  channel_type: 'TEXT' | 'VOICE',
  input: ChannelWriteInput,
): Promise<ChannelDto> {
  const res = await authenticatedFetch(apiUrl('/api/v1/channels'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, channel_type }),
  });
  const json = await parseJsonBody(res);
  return parseOk<ChannelDto>(res, json);
}

export async function reorderChannelsApi(
  channel_type: 'TEXT' | 'VOICE',
  channel_ids: number[],
): Promise<void> {
  const res = await authenticatedFetch(apiUrl('/api/v1/channels/order'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel_type, channel_ids }),
  });
  const json = await parseJsonBody(res);
  parseOk<{ ok: true }>(res, json);
}

export async function deleteChannelApi(id: number): Promise<void> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/channels/${id}`), { method: 'DELETE' });
  const json = await parseJsonBody(res);
  parseOk<{ ok: true }>(res, json);
}

const CHANNEL_BY_ID_CACHE_MS = 2500;
const channelByIdMemory = new Map<number, { data: ChannelDto; at: number }>();
const channelByIdInFlight = new Map<number, Promise<ChannelDto>>();

export async function updateChannelApi(id: number, input: ChannelWriteInput): Promise<ChannelDto> {
  const res = await authenticatedFetch(apiUrl(`/api/v1/channels/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await parseJsonBody(res);
  const data = parseOk<ChannelDto>(res, json);
  channelByIdMemory.delete(id);
  return data;
}

export async function fetchChannelById(id: number, opts?: { force?: boolean }): Promise<ChannelDto> {
  if (!opts?.force) {
    const mem = channelByIdMemory.get(id);
    if (mem && Date.now() - mem.at < CHANNEL_BY_ID_CACHE_MS) {
      return mem.data;
    }
    const existing = channelByIdInFlight.get(id);
    if (existing) {
      return existing;
    }
  }
  const p = (async () => {
    const res = await authenticatedFetch(apiUrl(`/api/v1/channels/${id}`));
    const json = await parseJsonBody(res);
    const data = parseOk<ChannelDto>(res, json);
    channelByIdMemory.set(id, { data, at: Date.now() });
    return data;
  })().finally(() => {
    if (channelByIdInFlight.get(id) === p) {
      channelByIdInFlight.delete(id);
    }
  });
  channelByIdInFlight.set(id, p);
  return p;
}

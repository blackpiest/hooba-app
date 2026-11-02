import { prisma } from '../../core/database/prisma.js';
import { channelAudienceSelect, privateAudienceOf } from '../../core/permissions/channel-visibility.js';

/** Кто видит голосовую комнату в `voice:rooms_snapshot`. null в members — канал публичный. */
export type VoiceChannelAccess = { members: ReadonlySet<number> | null };

/** Удалённый или ненайденный канал не показываем никому. */
const HIDDEN: VoiceChannelAccess = { members: new Set() };

/**
 * Снапшот рассылается на каждое изменение speaking/mute, поэтому доступ к каналам кэшируется.
 * Сброс — по `internal:channel_access_changed` (канал изменён или удалён), по кику
 * (удаляются все членства пользователя) и по смене ролей (роли видимости канала).
 */
const cache = new Map<number, VoiceChannelAccess>();
/** Растёт при каждом сбросе: результат запроса, начатого до сброса, в кэш не пишем. */
let generation = 0;

export function canSeeVoiceRoom(access: VoiceChannelAccess | undefined, userId: number): boolean {
  if (!access) return false;
  return access.members === null || access.members.has(userId);
}

export function cachedVoiceChannelAccess(channelId: number): VoiceChannelAccess | undefined {
  return cache.get(channelId);
}

export function missingVoiceChannelAccess(channelIds: readonly number[]): number[] {
  return channelIds.filter((id) => !cache.has(id));
}

const LOAD_ATTEMPTS = 3;

export async function loadVoiceChannelAccess(channelIds: readonly number[]): Promise<void> {
  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt += 1) {
    const ids = missingVoiceChannelAccess(channelIds);
    if (ids.length === 0) return;
    const startedAt = generation;
    const rows = await prisma.channel.findMany({
      where: { id: { in: ids }, isDeleted: false },
      select: { id: true, ...channelAudienceSelect },
    });
    if (generation !== startedAt) continue;
    const found = new Map(rows.map((row) => [row.id, row]));
    for (const id of ids) {
      const row = found.get(id);
      cache.set(
        id,
        !row ? HIDDEN : { members: privateAudienceOf(row) },
      );
    }
    return;
  }
}

export function forgetVoiceChannelAccess(channelId: number): void {
  generation += 1;
  cache.delete(channelId);
}

export function clearVoiceChannelAccess(): void {
  generation += 1;
  cache.clear();
}

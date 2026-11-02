import { listPresenceUserIds, publicGameOf, publicStatusOf } from '../../core/presence/presence-registry.js';
import type { PublicPresenceStatus } from '../../core/presence/resolve-public-status.js';
import { getVoiceRoomsSnapshot } from '../voice/voice-registry.js';
import { voiceMinuteCounts } from './activity-rules.js';
import { channelScope, gameScope, recordActivity, type ActivityEntry } from './activity.service.js';

export const SAMPLE_INTERVAL_MS = 60_000;

export type ActivitySnapshot = {
  voiceRooms: { channelId: number; participants: { userId: number; deafened: boolean }[] }[];
  presence: { userId: number; status: PublicPresenceStatus; game: string | null }[];
};

/**
 * Минута активности по снимку: голос (по правилам `voiceMinuteCounts`), видимая игра и онлайн.
 * Онлайн — только опубликованный `online`/`dnd`: «отошёл» и невидимка не копят (как видят другие).
 */
export function collectActivityMinute(snapshot: ActivitySnapshot): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const room of snapshot.voiceRooms) {
    for (const participant of room.participants) {
      if (voiceMinuteCounts(participant, room.participants.length)) {
        entries.push({ userId: participant.userId, kind: 'VOICE', scope: channelScope(room.channelId), value: 1 });
      }
    }
  }
  for (const row of snapshot.presence) {
    if (row.status === 'online' || row.status === 'dnd') {
      entries.push({ userId: row.userId, kind: 'ONLINE', scope: '', value: 1 });
    }
    if (row.game) {
      entries.push({ userId: row.userId, kind: 'GAME', scope: gameScope(row.game), value: 1 });
    }
  }
  return entries;
}

function takeSnapshot(): ActivitySnapshot {
  return {
    voiceRooms: getVoiceRoomsSnapshot().map((room) => ({
      channelId: room.channel_id,
      participants: room.participants.map((p) => ({ userId: p.user_id, deafened: p.deafened })),
    })),
    presence: listPresenceUserIds().map((userId) => ({
      userId,
      status: publicStatusOf(userId),
      game: publicGameOf(userId),
    })),
  };
}

/**
 * Раз в минуту пишет снимок в копилки. Падение процесса теряет не больше минуты, входы и выходы
 * отслеживать не нужно. Ошибка записи не останавливает таймер.
 */
export function startActivitySampler(onError: (error: unknown) => void): () => void {
  const timer = setInterval(() => {
    void recordActivity(collectActivityMinute(takeSnapshot())).catch(onError);
  }, SAMPLE_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

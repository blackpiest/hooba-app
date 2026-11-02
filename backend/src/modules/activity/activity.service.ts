import type { ActivityKind } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { hourStart, MessageThrottle, messageCounts } from './activity-rules.js';

export type ActivityEntry = {
  userId: number;
  kind: ActivityKind;
  /** `ch:<id>`, `game:<название>` или '' (без уточнения). */
  scope: string;
  value: number;
  /** Момент активности; по умолчанию — сейчас. */
  at?: number;
};

type ActivityListener = (userIds: ReadonlySet<number>) => void;
const listeners = new Set<ActivityListener>();

/** Подписка на «у этих пользователей прибавилась активность» — так оценщик испытаний узнаёт, кого проверить. */
export function onActivityRecorded(listener: ActivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function channelScope(channelId: number): string {
  return `ch:${channelId}`;
}

export function gameScope(title: string): string {
  return `game:${title}`;
}

/**
 * Прибавить к копилкам одним запросом. Записи с одинаковым ключом складываются заранее:
 * `ON CONFLICT` не может дважды обновить одну строку в одной вставке.
 */
export async function recordActivity(entries: readonly ActivityEntry[]): Promise<void> {
  const merged = new Map<string, { userId: number; hour: Date; kind: ActivityKind; scope: string; value: number }>();
  const now = Date.now();
  for (const entry of entries) {
    if (entry.value <= 0) {
      continue;
    }
    const hour = hourStart(entry.at ?? now);
    const key = `${entry.userId}|${hour.getTime()}|${entry.kind}|${entry.scope}`;
    const current = merged.get(key);
    if (current) {
      current.value += entry.value;
    } else {
      merged.set(key, { userId: entry.userId, hour, kind: entry.kind, scope: entry.scope, value: entry.value });
    }
  }
  const rows = [...merged.values()];
  if (rows.length === 0) {
    return;
  }
  // ISO с «Z» в timestamp без пояса сохраняется как есть: копилки хранят UTC.
  await prisma.$executeRaw`
    INSERT INTO "ActivityHour" ("userId", "hour", "kind", "scope", "value")
    SELECT * FROM unnest(
      ${rows.map((row) => row.userId)}::int[],
      ${rows.map((row) => row.hour.toISOString())}::timestamp[],
      ${rows.map((row) => row.kind)}::text[]::"ActivityKind"[],
      ${rows.map((row) => row.scope)}::text[],
      ${rows.map((row) => row.value)}::int[]
    )
    ON CONFLICT ("userId", "hour", "kind", "scope")
    DO UPDATE SET "value" = "ActivityHour"."value" + EXCLUDED."value"`;
  const userIds = new Set(rows.map((row) => row.userId));
  for (const listener of listeners) {
    listener(userIds);
  }
}

const messageThrottle = new MessageThrottle();

/** Отправленное сообщение — в копилку, если проходит правила накрутки (`activity-rules.ts`). Ошибки не мешают отправке. */
export function recordMessageActivity(
  userId: number,
  channelId: number,
  content: string,
  hasAttachments: boolean,
  onError: (error: unknown) => void,
): void {
  if (!messageCounts(content, hasAttachments) || !messageThrottle.take(userId, Date.now())) {
    return;
  }
  void recordActivity([{ userId, kind: 'MESSAGE', scope: channelScope(channelId), value: 1 }]).catch(onError);
}

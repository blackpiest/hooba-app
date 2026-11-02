import type { MessageDto } from '@/shared/api/messages';
import type { AttachmentDto } from '@/shared/api/attachments';

export type TempMessageRow = {
  id: string;
  channel_id: number;
  author_id: number;
  author_username: string;
  content: string;
  attachments?: AttachmentDto[];
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  tempId: string;
  /** Ack не пришёл: сокет был закрыт, оборвался или сервер молчит дольше таймаута. */
  failed?: boolean;
};

export type ChatRow = MessageDto | TempMessageRow;

export function isTempRow(row: ChatRow): row is TempMessageRow {
  return 'tempId' in row && typeof row.tempId === 'string';
}

function sortKey(row: ChatRow): [number, number] {
  const time = Date.parse(row.created_at);
  const id = isTempRow(row) ? Number.MAX_SAFE_INTEGER : row.id;
  return [Number.isFinite(time) ? time : 0, id];
}

export function compareChatRows(a: ChatRow, b: ChatRow): number {
  const [timeA, idA] = sortKey(a);
  const [timeB, idB] = sortKey(b);
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  return idA - idB;
}

export function sortChatRows(rows: ChatRow[]): ChatRow[] {
  return [...rows].sort(compareChatRows);
}

function persistentId(row: ChatRow): number | null {
  return isTempRow(row) ? null : row.id;
}

/** Ответ истории не затирает оптимистичные строки и сообщения, уже пришедшие по сокету. */
export function mergeInitialHistory(current: ChatRow[], page: MessageDto[]): ChatRow[] {
  const pageIds = new Set(page.map((message) => message.id));
  const kept = current.filter((row) => {
    const id = persistentId(row);
    return id === null || !pageIds.has(id);
  });
  return sortChatRows([...page, ...kept]);
}

export function applyIncomingMessage(rows: ChatRow[], message: MessageDto): ChatRow[] {
  if (rows.some((row) => persistentId(row) === message.id)) {
    return rows;
  }
  return sortChatRows([...rows, message]);
}

/** Ack заменяет временную строку. Если `message:new` уже вставил ту же запись, временная просто исчезает. */
export function applyMessageAck(rows: ChatRow[], tempId: string, real: MessageDto): ChatRow[] {
  const withoutTemp = rows.filter((row) => !(isTempRow(row) && row.tempId === tempId));
  if (withoutTemp.some((row) => persistentId(row) === real.id)) {
    return sortChatRows(withoutTemp);
  }
  return sortChatRows([...withoutTemp, real]);
}

/**
 * Последняя страница, перезапрошенная после обрыва сокета.
 * Полная страница целиком новее показанной истории — между ними могли пропасть сообщения.
 * Тогда старое выбрасываем (`reset`), и пагинация вверх догрузит его заново без дыры.
 */
export function mergeRefreshedHistory(
  current: ChatRow[],
  page: MessageDto[],
  pageIsFull: boolean,
): { rows: ChatRow[]; reset: boolean } {
  const oldestFresh = oldestPersistentMessage(page);
  let newestKnown: MessageDto | null = null;
  for (const row of current) {
    if (!isTempRow(row) && (!newestKnown || compareChatRows(row, newestKnown) > 0)) {
      newestKnown = row;
    }
  }
  const reset =
    pageIsFull && oldestFresh !== null && newestKnown !== null && compareChatRows(newestKnown, oldestFresh) < 0;
  const base = reset ? current.filter(isTempRow) : current;
  return { rows: mergeInitialHistory(base, page), reset };
}

/** Помечает неотправленными временные строки: одну по `tempId` или все ждущие ack (`null`). */
export function markTempFailed(rows: ChatRow[], tempId: string | null): ChatRow[] {
  let changed = false;
  const next = rows.map((row) => {
    if (!isTempRow(row) || row.failed || (tempId !== null && row.tempId !== tempId)) {
      return row;
    }
    changed = true;
    return { ...row, failed: true };
  });
  return changed ? next : rows;
}

/**
 * Свежая страница после реконнекта: неотправленная строка, чей текст уже лежит
 * в истории от этого автора не раньше её создания, на самом деле дошла — ack потерялся вместе с сокетом.
 */
export function dropDeliveredTemps(rows: ChatRow[], page: MessageDto[], authorId: number | null): ChatRow[] {
  if (authorId === null) {
    return rows;
  }
  const used = new Set<number>();
  let changed = false;
  const next = rows.filter((row) => {
    if (!isTempRow(row) || !row.failed) {
      return true;
    }
    const sentAt = Date.parse(row.created_at);
    const match = page.find(
      (message) =>
        !used.has(message.id) &&
        message.author_id === authorId &&
        message.content === row.content &&
        (message.attachments?.length ?? 0) === (row.attachments?.length ?? 0) &&
        (!Number.isFinite(sentAt) || Date.parse(message.created_at) >= sentAt - 60_000),
    );
    if (!match) {
      return true;
    }
    used.add(match.id);
    changed = true;
    return false;
  });
  return changed ? next : rows;
}

export function mergeOlderPage(current: ChatRow[], older: MessageDto[]): ChatRow[] {
  const ids = new Set(
    current.flatMap((row) => {
      const id = persistentId(row);
      return id === null ? [] : [id];
    }),
  );
  const fresh = older.filter((message) => !ids.has(message.id));
  return sortChatRows([...fresh, ...current]);
}

/**
 * Сколько новейших сообщений клиент уже держит.
 * Сервер отдаёт страницу через offset от новых к старым, поэтому живое сообщение
 * новее загруженной страницы тоже занимает слот и не должно сдвигать следующую страницу мимо границы.
 */
export function historyRequestOffset(rows: ChatRow[]): number {
  return rows.reduce((count, row) => count + (isTempRow(row) ? 0 : 1), 0);
}

/** Самое старое уже показанное сообщение: следующая страница запрашивается строго старше него. */
export function oldestPersistentMessage(rows: ChatRow[]): MessageDto | null {
  let oldest: MessageDto | null = null;
  for (const row of rows) {
    if (isTempRow(row)) {
      continue;
    }
    if (!oldest || compareChatRows(row, oldest) < 0) {
      oldest = row;
    }
  }
  return oldest;
}

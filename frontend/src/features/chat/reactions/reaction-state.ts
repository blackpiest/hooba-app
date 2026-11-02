import type { ReactionDto } from "@/shared/api/messages";
import { isTempRow, type ChatRow } from "@/features/chat/message-history";

/** Оптимистично поставить или снять свою реакцию; сервер потом пришлёт точный список. */
export function toggleReaction(
  reactions: readonly ReactionDto[],
  emoji: string,
  userId: number,
  on: boolean,
): ReactionDto[] {
  const index = reactions.findIndex((reaction) => reaction.emoji === emoji);
  const current = index >= 0 ? reactions[index] : undefined;
  if (on) {
    if (current?.user_ids.includes(userId)) {
      return [...reactions];
    }
    if (!current) {
      const customId = /^c:(\d+)$/.exec(emoji)?.[1];
      return [
        ...reactions,
        { emoji, custom_emoji_id: customId ? Number(customId) : null, count: 1, user_ids: [userId] },
      ];
    }
    return reactions.map((reaction, i) =>
      i === index ? { ...reaction, count: reaction.count + 1, user_ids: [...reaction.user_ids, userId] } : reaction,
    );
  }
  if (!current?.user_ids.includes(userId)) {
    return [...reactions];
  }
  if (current.count <= 1) {
    return reactions.filter((_, i) => i !== index);
  }
  return reactions.map((reaction, i) =>
    i === index
      ? { ...reaction, count: reaction.count - 1, user_ids: reaction.user_ids.filter((id) => id !== userId) }
      : reaction,
  );
}

/** Убрать реакции удалённым смайликом сообщества (сервер удалил их каскадом и по сообщениям не рассылает). */
export function dropCustomEmojiReactions(rows: ChatRow[], customEmojiId: number): ChatRow[] {
  let changed = false;
  const next = rows.map((row) => {
    if (isTempRow(row) || !row.reactions?.some((reaction) => reaction.custom_emoji_id === customEmojiId)) {
      return row;
    }
    changed = true;
    return { ...row, reactions: row.reactions.filter((reaction) => reaction.custom_emoji_id !== customEmojiId) };
  });
  return changed ? next : rows;
}

/** Заменить реакции у сообщения в ленте. Строки без изменений сохраняют ссылку (memo строк). */
export function applyMessageReactions(rows: ChatRow[], messageId: number, reactions: ReactionDto[]): ChatRow[] {
  let changed = false;
  const next = rows.map((row) => {
    if (isTempRow(row) || row.id !== messageId) {
      return row;
    }
    changed = true;
    return { ...row, reactions };
  });
  return changed ? next : rows;
}

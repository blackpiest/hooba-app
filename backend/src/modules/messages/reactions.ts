/**
 * Реакции на сообщения: ключ и группировка. Ключ — один unicode-эмодзи или `c:<id>` кастомного смайлика.
 */

export const MAX_REACTION_KINDS_PER_MESSAGE = 10;
const MAX_REACTION_KEY_LENGTH = 64;

/**
 * Unicode-эмодзи: одна графема только из эмодзи-символов с «якорем» — пиктограммой, парой флага или keycap.
 * Emoji_Component покрывает ZWJ, тоны кожи, keycap и теги флагов.
 * Не \p{RGI_Emoji}: эмодзи новее таблиц Node тоже должны проходить.
 */
const EMOJI_CHARS_RE = /^[\p{Extended_Pictographic}\p{Emoji_Component}]+$/u;
const EMOJI_ANCHOR_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|^[#*0-9]⃣$/u;
/** Теги допустимы только во флаге-регионе: 🏴 + 2–6 букв + конец тега (🏴󠁧󠁢󠁳󠁣󠁴󠁿). */
const TAG_CHAR_RE = /[\u{E0020}-\u{E007F}]/u;
const TAG_FLAG_RE = /^\u{1F3F4}[\u{E0061}-\u{E007A}]{2,6}\u{E007F}$/u;
/** Самые длинные RGI-последовательности (пара с тонами кожи) — 9 кодовых точек без VS16. */
const MAX_EMOJI_CODE_POINTS = 12;
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

function isSingleEmoji(raw: string): boolean {
  return (
    [...raw].length <= MAX_EMOJI_CODE_POINTS &&
    EMOJI_CHARS_RE.test(raw) &&
    EMOJI_ANCHOR_RE.test(raw) &&
    (!TAG_CHAR_RE.test(raw) || TAG_FLAG_RE.test(raw)) &&
    [...graphemes.segment(raw)].length === 1
  );
}

/**
 * Ключ без VS16 (U+FE0F): `👍` и `👍️` — одна реакция. Клиент рисует полную форму по своему реестру эмодзи.
 * Синхронно с `normalizeReactionKey` во frontend `features/chat/emoji/registry.ts`.
 */
export function normalizeReactionKey(raw: string): string {
  return raw.replaceAll('️', '');
}

const CUSTOM_KEY_RE = /^c:([1-9]\d{0,9})$/;

export type ReactionKey = { emoji: string; customEmojiId: number | null };

/** null — ключ не эмодзи. */
export function parseReactionKey(raw: string): ReactionKey | null {
  if (raw.length === 0 || raw.length > MAX_REACTION_KEY_LENGTH) {
    return null;
  }
  const custom = CUSTOM_KEY_RE.exec(raw);
  if (custom) {
    const id = Number(custom[1]);
    return Number.isSafeInteger(id) && id <= 2_147_483_647 ? { emoji: raw, customEmojiId: id } : null;
  }
  const emoji = normalizeReactionKey(raw);
  return isSingleEmoji(emoji) ? { emoji, customEmojiId: null } : null;
}

export type ReactionRow = { emoji: string; customEmojiId: number | null; userId: number };

export type ReactionDto = {
  emoji: string;
  custom_emoji_id: number | null;
  count: number;
  user_ids: number[];
};

/** Строки в порядке создания → группы в порядке первой реакции. */
export function groupReactions(rows: readonly ReactionRow[]): ReactionDto[] {
  const groups = new Map<string, ReactionDto>();
  for (const row of rows) {
    let group = groups.get(row.emoji);
    if (!group) {
      group = { emoji: row.emoji, custom_emoji_id: row.customEmojiId, count: 0, user_ids: [] };
      groups.set(row.emoji, group);
    }
    group.count += 1;
    group.user_ids.push(row.userId);
  }
  return [...groups.values()];
}

/** Выборка строк для `groupReactions` (в `include` сообщений — с `orderBy: { id: 'asc' }`). */
export const reactionRowSelect = { emoji: true, customEmojiId: true, userId: true } as const;

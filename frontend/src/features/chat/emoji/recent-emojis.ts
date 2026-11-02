import { customEmojiById, emojiByName, emojiNameByChar, reactionKeyOf, type EmojiEntry } from "./registry";

const STORAGE_KEY = "hooba_recent_emojis";
const LIMIT = 24;

/** Ключи недавно выбранных эмодзи (как `reactionKeyOf`), свежие первыми. */
export function readRecentEmojiKeys(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((key): key is string => typeof key === "string" && key.length > 0).slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function rememberRecentEmoji(entry: EmojiEntry): void {
  const key = reactionKeyOf(entry);
  if (!key) {
    return;
  }
  const next = [key, ...readRecentEmojiKeys().filter((item) => item !== key)].slice(0, LIMIT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* хранилище недоступно — категория просто не пополнится */
  }
}

/** Недавние эмодзи для пикера: удалённые смайлики и неизвестные ключи пропускаются, без `withCustom` — только unicode. */
export function listRecentEmojis(withCustom: boolean): EmojiEntry[] {
  const entries: EmojiEntry[] = [];
  for (const key of readRecentEmojiKeys()) {
    if (key.startsWith("c:")) {
      const custom = withCustom ? customEmojiById(key.slice(2)) : undefined;
      if (custom) entries.push(custom);
      continue;
    }
    const name = emojiNameByChar(key);
    const entry = name ? emojiByName(name) : undefined;
    if (entry) entries.push(entry);
  }
  return entries;
}

import { useSyncExternalStore } from "react";
import compactData from "emojibase-data/en/compact.json" with { type: "json" };
import githubData from "emojibase-data/en/shortcodes/github.json" with { type: "json" };

export type EmojiEntry = {
  name: string;
  char?: string;
  imageUrl?: string;
  id?: string;
  category: string;
  keywords: string[];
};

export type EmojiCategory = {
  id: number;
  label: string;
  emojis: EmojiEntry[];
};

type CompactEmoji = {
  hexcode: string;
  label: string;
  unicode?: string;
  group?: number;
  order?: number;
  tags?: string[];
  emoticon?: string | string[];
};

const CATEGORY_LABELS: { id: number; label: string }[] = [
  { id: 0, label: "Смайлы" },
  { id: 1, label: "Люди" },
  { id: 3, label: "Природа" },
  { id: 4, label: "Еда" },
  { id: 6, label: "Занятия" },
  { id: 5, label: "Места" },
  { id: 7, label: "Предметы" },
  { id: 8, label: "Символы" },
  { id: 9, label: "Флаги" },
];

const compact = compactData as CompactEmoji[];
const github = githubData as Record<string, string | string[]>;

const byName = new Map<string, EmojiEntry>();
const charToName = new Map<string, string>();
const customById = new Map<string, EmojiEntry>();
let customList: EmojiEntry[] = [];
let customVersion = 0;
const customListeners = new Set<() => void>();

function aliasesFor(hexcode: string): string[] {
  const raw = github[hexcode];
  if (raw == null) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

function pickName(aliases: string[], label: string, hexcode: string): string {
  const alpha = aliases.filter((name) => /^[a-z][a-z0-9_-]*$/.test(name));
  const pool = alpha.length > 0 ? alpha : aliases;
  if (pool.length > 0) {
    return [...pool].sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? hexcode.toLowerCase();
  }
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || hexcode.toLowerCase();
}

function rememberChar(char: string, name: string) {
  if (!charToName.has(char)) {
    charToName.set(char, name);
  }
  const bare = char.replaceAll("\uFE0F", "");
  if (bare !== char && bare.length > 0 && !charToName.has(bare)) {
    charToName.set(bare, name);
  }
}

function buildCategories(): EmojiCategory[] {
  const used = new Set<string>();
  const grouped = new Map<number, EmojiEntry[]>();
  const rows = compact
    .filter((row) => row.unicode && row.group != null && row.group !== 2)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const row of rows) {
    const unicode = row.unicode;
    const group = row.group;
    if (!unicode || group == null) {
      continue;
    }
    const label = CATEGORY_LABELS.find((item) => item.id === group)?.label;
    if (!label) {
      continue;
    }
    const aliases = aliasesFor(row.hexcode);
    let name = pickName(aliases, row.label, row.hexcode);
    if (used.has(name)) {
      let index = 2;
      while (used.has(`${name}_${index}`)) {
        index += 1;
      }
      name = `${name}_${index}`;
    }
    used.add(name);
    const keywords = new Set<string>([name, ...aliases]);
    for (const tag of row.tags ?? []) {
      if (tag) {
        keywords.add(tag.toLowerCase());
      }
    }
    for (const word of row.label.toLowerCase().split(/\s+/)) {
      if (word) {
        keywords.add(word);
      }
    }
    const emoticons = row.emoticon == null ? [] : Array.isArray(row.emoticon) ? row.emoticon : [row.emoticon];
    for (const emoticon of emoticons) {
      if (emoticon) {
        keywords.add(emoticon.toLowerCase());
      }
    }
    const entry: EmojiEntry = {
      name,
      char: unicode,
      category: label,
      keywords: [...keywords],
    };
    byName.set(name, entry);
    rememberChar(unicode, name);
    const list = grouped.get(group) ?? [];
    list.push(entry);
    grouped.set(group, list);
  }

  return CATEGORY_LABELS.map((category) => ({
    id: category.id,
    label: category.label,
    emojis: grouped.get(category.id) ?? [],
  })).filter((category) => category.emojis.length > 0);
}

export const emojiCategories: EmojiCategory[] = buildCategories();

export function emojiByName(name: string): EmojiEntry | undefined {
  return byName.get(name.toLowerCase());
}

export function emojiNameByChar(char: string): string | undefined {
  return charToName.get(char) ?? charToName.get(char.replaceAll("\uFE0F", ""));
}

/** Только картинки по http(s) или с того же сервера: `javascript:`, `data:` и прочее отбрасываются. */
export function isSafeEmojiImage(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    return true;
  }
  try {
    // http: — адрес своего сервера в desktop/LAN (`apiUrl`).
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Смайлики сообщества (`stores/emoji-store.ts`) — только для реакций, в тексте сообщений не используются. */
export function registerCustomEmojis(entries: EmojiEntry[]) {
  customById.clear();
  for (const entry of entries) {
    if (!entry.id || !entry.imageUrl || !isSafeEmojiImage(entry.imageUrl)) {
      continue;
    }
    if (!/^[a-z0-9_+-]{1,64}$/.test(entry.name) || !/^\d+$/.test(entry.id)) {
      continue;
    }
    customById.set(entry.id, entry);
  }
  customList = [...customById.values()];
  customVersion += 1;
  for (const listener of customListeners) {
    listener();
  }
}

function subscribeCustomEmojis(listener: () => void): () => void {
  customListeners.add(listener);
  return () => customListeners.delete(listener);
}

/** Номер версии набора смайликов: меняется при каждой регистрации — для перерисовки текста и пикера. */
export function useCustomEmojiVersion(): number {
  return useSyncExternalStore(subscribeCustomEmojis, () => customVersion);
}

export function customEmojiById(id: string): EmojiEntry | undefined {
  return customById.get(id);
}

export function listCustomEmojis(): EmojiEntry[] {
  return customList;
}

export function emojiInsertText(entry: EmojiEntry): string | null {
  if (entry.id) {
    return `<:${entry.name}:${entry.id}>`;
  }
  return entry.char ?? null;
}

/** Ключ реакции без VS16, как хранит сервер (`normalizeReactionKey` в backend `messages/reactions.ts`). */
export function normalizeReactionKey(key: string): string {
  return key.replaceAll("️", "");
}

/** Ключ реакции для сервера: unicode-эмодзи или `c:<id>` смайлика сообщества. */
export function reactionKeyOf(entry: EmojiEntry): string | null {
  if (entry.id) {
    return `c:${entry.id}`;
  }
  return entry.char ? normalizeReactionKey(entry.char) : null;
}

/** Полная форма эмодзи для показа (`❤` → `❤️`, иначе часть систем рисует его текстовым символом). */
export function reactionDisplayChar(key: string): string {
  const name = emojiNameByChar(key);
  const char = name ? emojiByName(name)?.char : undefined;
  return char && normalizeReactionKey(char) === key ? char : key;
}

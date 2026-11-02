import { splitHttpsLinks } from "@/shared/ui/message-text/https-links";
import {
  emojiByName,
  emojiNameByChar,
  isSafeEmojiImage,
} from "@/features/chat/emoji/registry";

export const MESSAGE_CONTENT_LIMIT = 2000;
export const MESSAGE_CONTENT_COUNTER_FROM = 1800;

const SHORTCODE = /^:([a-z0-9_+-]{1,64}):/;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export type FormatKind = "bold" | "italic" | "strike" | "underline" | "code";

const MARKERS: Record<FormatKind, string> = {
  bold: "**",
  italic: "*",
  strike: "~~",
  underline: "__",
  code: "`",
};

export type MessageNode =
  | { type: "text"; value: string }
  | { type: "link"; value: string }
  | { type: "emoji"; char: string; name: string }
  | { type: "image"; src: string; name: string }
  | { type: "code"; value: string }
  | { type: "bold" | "italic" | "strike" | "underline"; children: MessageNode[] };

type CaretResult = { text: string; caret: number | null };

export function collapseExtraNewlines(text: string, caret: number | null = null): CaretResult {
  const matches = [...text.matchAll(/\n{4,}/g)];
  if (matches.length === 0) {
    return { text, caret };
  }
  let nextCaret = caret;
  if (caret != null) {
    let removedBefore = 0;
    let placed = false;
    for (const match of matches) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const removed = match[0].length - 3;
      if (caret >= end) {
        removedBefore += removed;
        continue;
      }
      if (caret > start) {
        const within = Math.min(caret - start, 3);
        nextCaret = start - removedBefore + within;
        placed = true;
      }
      break;
    }
    if (!placed) {
      nextCaret = caret - removedBefore;
    }
  }
  return { text: text.replace(/\n{4,}/g, "\n\n\n"), caret: nextCaret };
}

export function expandShortcodes(text: string, caret: number | null = null): CaretResult {
  let out = "";
  let mapped: number | null = null;
  let i = 0;
  while (i < text.length) {
    if (caret === i) {
      mapped = out.length;
    }
    if (text[i] === ":" && text[i - 1] !== "<") {
      const match = SHORTCODE.exec(text.slice(i));
      const name = match?.[1];
      const entry = name ? emojiByName(name) : undefined;
      if (match && entry?.char) {
        const tokenLength = match[0].length;
        if (caret != null && caret > i && caret <= i + tokenLength) {
          mapped = out.length + entry.char.length;
        }
        out += entry.char;
        i += tokenLength;
        continue;
      }
    }
    out += text[i];
    i += 1;
  }
  if (caret === text.length) {
    mapped = out.length;
  }
  return { text: out, caret: caret == null ? null : (mapped ?? out.length) };
}

export function normalizeComposerText(text: string, caret: number | null = null): CaretResult {
  const expanded = expandShortcodes(text, caret);
  return collapseExtraNewlines(expanded.text, expanded.caret);
}

export function canonicalMessageContent(display: string): string {
  const collapsed = collapseExtraNewlines(display).text;
  let out = "";
  for (const { segment } of segmenter.segment(collapsed)) {
    const name = emojiNameByChar(segment);
    out += name ? `:${name}:` : segment;
  }
  return out.trim();
}

export function displayMessageContent(canonical: string): string {
  return expandShortcodes(collapseExtraNewlines(canonical).text).text;
}

export function canSendMessageDraft(display: string): boolean {
  const text = canonicalMessageContent(display);
  return text.length > 0 && text.length <= MESSAGE_CONTENT_LIMIT;
}

export function canonicalMessageLength(display: string): number {
  return canonicalMessageContent(display).length;
}

function isWrapped(value: string, start: number, end: number, marker: string): boolean {
  if (value.slice(start - marker.length, start) !== marker) {
    return false;
  }
  if (value.slice(end, end + marker.length) !== marker) {
    return false;
  }
  if (marker === "*") {
    if (value[start - marker.length - 1] === "*") {
      return false;
    }
    if (value[end + marker.length] === "*") {
      return false;
    }
  }
  return true;
}

export function isFormatActive(value: string, start: number, end: number, kind: FormatKind): boolean {
  return isWrapped(value, start, end, MARKERS[kind]);
}

const FORMAT_SHORTCUTS: { kind: FormatKind; code: string; shift: boolean }[] = [
  { kind: "bold", code: "KeyB", shift: false },
  { kind: "italic", code: "KeyI", shift: false },
  { kind: "underline", code: "KeyU", shift: false },
  { kind: "strike", code: "KeyS", shift: true },
  { kind: "code", code: "KeyM", shift: true },
];

export function formatKindFromShortcut(event: {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): FormatKind | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return null;
  }
  const match = FORMAT_SHORTCUTS.find((item) => item.code === event.code && item.shift === event.shiftKey);
  return match?.kind ?? null;
}

export function toggleFormat(
  value: string,
  start: number,
  end: number,
  kind: FormatKind,
): { text: string; start: number; end: number } {
  const marker = MARKERS[kind];
  if (isWrapped(value, start, end, marker)) {
    const text = value.slice(0, start - marker.length) + value.slice(start, end) + value.slice(end + marker.length);
    return { text, start: start - marker.length, end: end - marker.length };
  }
  const text = value.slice(0, start) + marker + value.slice(start, end) + marker + value.slice(end);
  return { text, start: start + marker.length, end: end + marker.length };
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

/**
 * Серия из 3+ звёздочек без букв/цифр по краям — маска фильтра слов (`*****`), а не разметка:
 * содержимого в ней нет. Возвращает конец серии или -1.
 */
function literalStarRunEnd(text: string, index: number): number {
  if (text[index] !== "*" || (index > 0 && (text[index - 1] === "*" || WORD_CHAR.test(text[index - 1] ?? "")))) {
    return -1;
  }
  let end = index;
  while (text[end] === "*") {
    end += 1;
  }
  if (end - index < 3 || (end < text.length && WORD_CHAR.test(text[end] ?? ""))) {
    return -1;
  }
  return end;
}

function findWrapper(
  text: string,
  index: number,
  marker: string,
  allowEdgeSpace: boolean,
): { inner: string; end: number } | null {
  if (!text.startsWith(marker, index)) {
    return null;
  }
  if (marker === "*" && text.startsWith("**", index)) {
    return null;
  }
  if (marker === "_" && text.startsWith("__", index)) {
    return null;
  }
  // Маркер работает и внутри слова (`сло~~во~~`): панель форматирования оборачивает любое выделение.
  // Одиночная `*` сразу после `*` — хвост другой серии, а не начало курсива.
  if (marker.length === 1 && text[index - 1] === marker) {
    return null;
  }
  const contentStart = index + marker.length;
  let cursor = contentStart;
  while (cursor < text.length) {
    const literalEnd = literalStarRunEnd(text, cursor);
    if (literalEnd > 0) {
      cursor = literalEnd;
      continue;
    }
    if (text.startsWith(marker, cursor)) {
      if (marker === "*" && text[cursor + 1] === "*") {
        cursor += 1;
        continue;
      }
      if (marker === "_" && text[cursor + 1] === "_") {
        cursor += 1;
        continue;
      }
      const inner = text.slice(contentStart, cursor);
      const end = cursor + marker.length;
      if (inner.length === 0) {
        cursor += marker.length;
        continue;
      }
      if (!allowEdgeSpace && /^\s|\s$/.test(inner)) {
        cursor += marker.length;
        continue;
      }
      return { inner, end };
    }
    cursor += 1;
  }
  return null;
}

const WRAPPERS: { kind: FormatKind; marker: string; allowEdgeSpace: boolean }[] = [
  { kind: "code", marker: "`", allowEdgeSpace: true },
  { kind: "bold", marker: "**", allowEdgeSpace: false },
  { kind: "underline", marker: "__", allowEdgeSpace: false },
  { kind: "strike", marker: "~~", allowEdgeSpace: false },
  { kind: "italic", marker: "*", allowEdgeSpace: false },
];

function parsePlain(text: string): MessageNode[] {
  const nodes: MessageNode[] = [];
  let buffer = "";
  let index = 0;

  function flush() {
    if (!buffer) {
      return;
    }
    for (const part of splitHttpsLinks(buffer)) {
      nodes.push(part.type === "link" ? { type: "link", value: part.value } : { type: "text", value: part.value });
    }
    buffer = "";
  }

  while (index < text.length) {
    if (text[index] === ":" && text[index - 1] !== "<") {
      const match = SHORTCODE.exec(text.slice(index));
      const name = match?.[1];
      const entry = name ? emojiByName(name) : undefined;
      if (match && entry) {
        if (entry.char) {
          flush();
          nodes.push({ type: "emoji", char: entry.char, name: entry.name });
          index += match[0].length;
          continue;
        }
        if (entry.imageUrl && isSafeEmojiImage(entry.imageUrl)) {
          flush();
          nodes.push({ type: "image", src: entry.imageUrl, name: entry.name });
          index += match[0].length;
          continue;
        }
      }
    }
    buffer += text[index];
    index += 1;
  }
  flush();
  return nodes;
}

function parseFormatted(text: string): MessageNode[] {
  const nodes: MessageNode[] = [];
  let plainStart = 0;
  let index = 0;
  while (index < text.length) {
    const literalEnd = literalStarRunEnd(text, index);
    if (literalEnd > 0) {
      index = literalEnd;
      continue;
    }
    let found: { kind: FormatKind; inner: string; end: number } | null = null;
    for (const wrapper of WRAPPERS) {
      const match = findWrapper(text, index, wrapper.marker, wrapper.allowEdgeSpace);
      if (match) {
        found = { kind: wrapper.kind, inner: match.inner, end: match.end };
        break;
      }
    }
    if (!found) {
      index += 1;
      continue;
    }
    if (index > plainStart) {
      nodes.push(...parsePlain(text.slice(plainStart, index)));
    }
    if (found.kind === "code") {
      nodes.push({ type: "code", value: found.inner });
    } else {
      nodes.push({ type: found.kind, children: parsePlain(found.inner) });
    }
    index = found.end;
    plainStart = index;
  }
  if (plainStart < text.length) {
    nodes.push(...parsePlain(text.slice(plainStart)));
  }
  return nodes;
}

export function parseMessageContent(source: string): MessageNode[] {
  if (!source) {
    return [];
  }
  return parseFormatted(collapseExtraNewlines(source).text);
}

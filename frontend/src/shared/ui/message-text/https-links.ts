import { isDesktopApp } from "@/shared/lib/server-target";

const HTTPS_LINK = /https:\/\/[^\s<>"']+/gi;
const BOUNDARY_BEFORE = /[\s([{"'«]/;

export type MessagePart = { type: "text" | "link"; value: string };

function countChar(value: string, char: string): number {
  let count = 0;
  for (const item of value) {
    if (item === char) {
      count += 1;
    }
  }
  return count;
}

function trimUrlTail(raw: string): string {
  let url = raw;
  while (url.length > "https://".length) {
    const last = url.at(-1);
    if (last && /[.,!?;:]/.test(last)) {
      url = url.slice(0, -1);
      continue;
    }
    if (last === ")" && countChar(url, "(") < countChar(url, ")")) {
      url = url.slice(0, -1);
      continue;
    }
    if (last === "]" && countChar(url, "[") < countChar(url, "]")) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return url;
}

function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function splitHttpsLinks(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(HTTPS_LINK)) {
    const start = match.index ?? 0;
    if (start < cursor) {
      continue;
    }
    const previous = start > 0 ? text[start - 1] : "";
    if (previous && !BOUNDARY_BEFORE.test(previous)) {
      continue;
    }
    const url = trimUrlTail(match[0]);
    if (!isSafeHttpsUrl(url)) {
      continue;
    }
    if (start > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, start) });
    }
    parts.push({ type: "link", value: url });
    cursor = start + url.length;
  }

  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }
  if (parts.length === 0) {
    return [{ type: "text", value: text }];
  }
  return parts;
}

export function openExternalHttps(url: string): void {
  if (!isSafeHttpsUrl(url)) {
    return;
  }
  if (isDesktopApp()) {
    void window.hoobaDesktop?.openExternal?.(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

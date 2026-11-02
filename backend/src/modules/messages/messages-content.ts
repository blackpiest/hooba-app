export const MAX_MESSAGE_CONTENT = 2000;

export function normalizeMessageContent(raw: string): string {
  return raw.trim().replace(/\n{4,}/g, '\n\n\n');
}

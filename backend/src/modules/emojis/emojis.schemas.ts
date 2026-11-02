import { z } from 'zod';

/** Лимит набора сообщества: больше смайликов загрузить нельзя, пока не удалить старые. */
export const MAX_CUSTOM_EMOJIS = 32;

/** Имя для токена `<:name:id>`; подмножество правила клиентского реестра эмодзи. */
export const emojiNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{2,32}$/, 'must be 2–32 characters: a-z, 0-9, _');

export const createEmojiQuerySchema = z.object({ name: emojiNameSchema });

export const patchEmojiBodySchema = z.object({ name: emojiNameSchema });

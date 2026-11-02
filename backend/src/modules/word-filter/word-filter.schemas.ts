import { z } from 'zod';
import { BANNED_WORD_MAX_LENGTH, BANNED_WORDS_MAX, normalizeBannedPattern } from './word-filter.js';

const bannedWordSchema = z.string().transform((value, ctx) => {
  const pattern = normalizeBannedPattern(value);
  if (!pattern) {
    ctx.addIssue({
      code: 'custom',
      message: `"${value.slice(0, BANNED_WORD_MAX_LENGTH)}" must be 1-${BANNED_WORD_MAX_LENGTH} letters or digits, "*" only at the start or end`,
    });
    return z.NEVER;
  }
  return pattern;
});

export const patchBannedWordsBodySchema = z.object({
  words: z
    .array(bannedWordSchema)
    .max(BANNED_WORDS_MAX)
    .transform((words) => [...new Set(words)]),
});

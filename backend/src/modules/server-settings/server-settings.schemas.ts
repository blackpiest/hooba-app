import { z } from 'zod';

/** IANA-пояс, который знает рантайм (`Europe/Moscow`, `UTC`). */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const patchServerSettingsBodySchema = z
  .object({
    user_invites_enabled: z.boolean().optional(),
    /** Часовой пояс сообщества: календарные дни и серии в испытаниях. */
    timezone: z.string().min(1).max(64).refine(isValidTimeZone, 'unknown time zone').optional(),
  })
  .refine((value) => value.user_invites_enabled !== undefined || value.timezone !== undefined, {
    message: 'nothing to update',
    path: ['body'],
  });

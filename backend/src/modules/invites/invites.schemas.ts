import { z } from 'zod';

export const createInviteBodySchema = z.object({
  expires_at: z
    .string()
    .optional()
    .refine((s) => s === undefined || s === '' || !Number.isNaN(Date.parse(s)), {
      message: 'Invalid ISO datetime',
    }),
});

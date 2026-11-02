import { z } from 'zod';

export const patchMessageBodySchema = z.object({
  content: z.string().min(1).max(2000),
});

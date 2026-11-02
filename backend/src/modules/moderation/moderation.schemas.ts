import { z } from 'zod';
import { MAX_DB_ID } from '../../core/http/params.js';

export const moderationUserBodySchema = z.object({
  user_id: z.number().int().positive().max(MAX_DB_ID),
  reason: z.string().max(500).optional(),
});

export const moderationLogsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

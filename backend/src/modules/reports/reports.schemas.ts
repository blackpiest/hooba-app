import { z } from 'zod';
import { MAX_DB_ID } from '../../core/http/params.js';

export const REPORT_REASON_MAX = 500;

export const reportCreateBodySchema = z.object({
  user_id: z.number().int().positive().max(MAX_DB_ID),
  reason: z.string().trim().min(1).max(REPORT_REASON_MAX),
});

export const reportsListQuerySchema = z.object({
  status: z.enum(['open', 'resolved']).default('open'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

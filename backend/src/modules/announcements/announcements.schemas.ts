import { z } from 'zod';
import { MAX_DB_ID } from '../../core/http/params.js';

export const ANNOUNCEMENT_TITLE_MAX = 100;
export const ANNOUNCEMENT_BODY_MAX = 4000;
export const ANNOUNCEMENT_AUDIENCE_MAX = 50;

/** Местное время сообщества с точностью до минуты: `2026-10-31T20:15` (пояс — `ServerSettings.timezone`). */
export const localMinuteSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/, 'must be YYYY-MM-DDTHH:mm');

const idsSchema = z.array(z.number().int().positive().max(MAX_DB_ID)).max(ANNOUNCEMENT_AUDIENCE_MAX).default([]);

/** Создание и правка (PATCH заменяет объявление целиком). Пустые `role_ids` и `user_ids` — всем. */
export const announcementBodySchema = z
  .object({
    title: z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX),
    body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX),
    show_at: localMinuteSchema,
    expires_at: localMinuteSchema.nullable().default(null),
    role_ids: idsSchema,
    user_ids: idsSchema,
  })
  .refine((v) => !v.expires_at || v.show_at < v.expires_at, { message: 'must be after show_at', path: ['expires_at'] });

export type AnnouncementInput = z.infer<typeof announcementBodySchema>;

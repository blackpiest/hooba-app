import { z } from 'zod';
import { MAX_DB_ID } from '../../core/http/params.js';

const memberUserIdsSchema = z.array(z.number().int().positive().max(MAX_DB_ID)).max(500);

/** null — действие доступно всем; массив — только этим ролям (и staff). */
const ruleRoleIdsSchema = z.array(z.number().int().positive().max(MAX_DB_ID)).max(100).nullable();

const channelRulesShape = {
  /** Только для приватного канала: его видят ещё и обладатели этих ролей. */
  view_role_ids: z.array(z.number().int().positive().max(MAX_DB_ID)).max(100).optional(),
  send_role_ids: ruleRoleIdsSchema.optional(),
  speak_role_ids: ruleRoleIdsSchema.optional(),
  stream_role_ids: ruleRoleIdsSchema.optional(),
  attach_role_ids: ruleRoleIdsSchema.optional(),
  react_role_ids: ruleRoleIdsSchema.optional(),
  /** Участники, которым реакции открыты вдобавок к `react_role_ids` (только при ограничении). */
  react_user_ids: z.array(z.number().int().positive().max(MAX_DB_ID)).max(100).optional(),
};

export const CHANNEL_NAME_MAX = 24;
/** Верхняя граница PATCH на уровне схемы: старые каналы длиннее лимита, точная проверка — в сервисе. */
const CHANNEL_NAME_LEGACY_MAX = 100;

const channelNameWith = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        // eslint-disable-next-line no-control-regex
        .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'must not contain control characters'),
    );

export const channelNameSchema = channelNameWith(CHANNEL_NAME_MAX);

export const createChannelBodySchema = z.object({
  name: channelNameSchema,
  channel_type: z.enum(['TEXT', 'VOICE']),
  is_private: z.boolean().optional().default(false),
  member_user_ids: memberUserIdsSchema.optional(),
  ...channelRulesShape,
});

export const patchChannelBodySchema = z.object({
  name: channelNameWith(CHANNEL_NAME_LEGACY_MAX).optional(),
  is_private: z.boolean().optional(),
  member_user_ids: memberUserIdsSchema.optional(),
  ...channelRulesShape,
});

export const reorderChannelsBodySchema = z
  .object({
    channel_type: z.enum(['TEXT', 'VOICE']),
    channel_ids: z.array(z.number().int().positive().max(MAX_DB_ID)).max(500),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.channel_ids).size !== value.channel_ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'channel_ids must be unique',
        path: ['channel_ids'],
      });
    }
  });

export const MESSAGE_OFFSET_LIMIT = 10_000;

export const channelMessagesQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(MESSAGE_OFFSET_LIMIT).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before_created_at: z.string().datetime().optional(),
    before_id: z.coerce.number().int().positive().max(MAX_DB_ID).optional(),
  })
  .superRefine((value, ctx) => {
    const hasTime = value.before_created_at !== undefined;
    const hasId = value.before_id !== undefined;
    if (hasTime !== hasId) {
      ctx.addIssue({
        code: 'custom',
        message: 'before_created_at and before_id are required together',
        path: ['before_created_at'],
      });
    }
  });

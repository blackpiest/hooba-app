import { z } from 'zod';
import { MAX_DB_ID } from '../../core/http/params.js';
import { COSMETIC_KINDS } from '../cosmetics/cosmetic-access.js';

/**
 * Местное время сообщества с точностью до часа: `2026-10-31T20:00` (пояс — `ServerSettings.timezone`).
 * Копилки активности почасовые, поэтому минуты не принимаются.
 */
export const localHourSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):00$/, 'must be YYYY-MM-DDTHH:00');

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/);
const amount = (max: number) => z.number().int().min(1).max(max);
const channelIdsSchema = z.array(z.number().int().positive().max(MAX_DB_ID)).min(1).max(20);
/** Необязательный период внутри испытания; `to` не включается. */
const period = { from: localHourSchema.optional(), to: localHourSchema.optional() };

/** Типы условий. Новый тип — запись здесь и функция прогресса в `conditions.ts`. */
export const conditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('messages'), count: amount(1_000_000), channel_ids: channelIdsSchema.optional(), ...period }),
  z.object({ type: z.literal('voice_minutes'), minutes: amount(1_000_000), channel_ids: channelIdsSchema.optional(), ...period }),
  z.object({
    type: z.literal('game_minutes'),
    minutes: amount(1_000_000),
    games: z.array(z.string().trim().min(1).max(120)).min(1).max(20).optional(),
    ...period,
  }),
  z.object({ type: z.literal('online_minutes'), minutes: amount(100_000), from: localHourSchema, to: localHourSchema }),
  z.object({ type: z.literal('active_days'), days: amount(3650), ...period }),
  z.object({ type: z.literal('streak_days'), days: z.number().int().min(2).max(3650) }),
  z.object({ type: z.literal('invites_joined'), count: amount(100) }),
  z.object({ type: z.literal('has_cosmetic'), kind: z.enum(COSMETIC_KINDS as [string, ...string[]]), item_id: idSchema }),
  z.object({ type: z.literal('challenge_done'), challenge_id: z.number().int().positive().max(MAX_DB_ID) }),
]);

export type Condition = z.infer<typeof conditionSchema>;
export type ConditionType = Condition['type'];
export type ConditionGroup = { op: 'all' | 'any'; items: ConditionNode[] };
export type ConditionNode = Condition | ConditionGroup;

export const CONDITION_GROUP_DEPTH_MAX = 2;
export const CONDITIONS_MAX = 10;

const groupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    op: z.enum(['all', 'any']),
    items: z.array(z.union([conditionSchema, groupSchema])).min(1).max(CONDITIONS_MAX),
  }),
);

export function isGroup(node: ConditionNode): node is ConditionGroup {
  return 'op' in node;
}

/** Все условия дерева (листья) — для проверок ссылок и подсчёта. */
export function conditionLeaves(node: ConditionNode): Condition[] {
  return isGroup(node) ? node.items.flatMap(conditionLeaves) : [node];
}

function depthOf(node: ConditionNode): number {
  return isGroup(node) ? 1 + Math.max(0, ...node.items.map(depthOf)) : 0;
}

/** Корень — всегда группа; вложенность групп и число условий ограничены, у периодов `from` раньше `to`. */
export const conditionTreeSchema = groupSchema.superRefine((tree, ctx) => {
  if (depthOf(tree) > CONDITION_GROUP_DEPTH_MAX) {
    ctx.addIssue({ code: 'custom', message: `groups nest at most ${CONDITION_GROUP_DEPTH_MAX} levels` });
  }
  const leaves = conditionLeaves(tree);
  if (leaves.length > CONDITIONS_MAX) {
    ctx.addIssue({ code: 'custom', message: `at most ${CONDITIONS_MAX} conditions` });
  }
  for (const leaf of leaves) {
    if ('from' in leaf && 'to' in leaf && leaf.from !== undefined && leaf.to !== undefined && leaf.from >= leaf.to) {
      ctx.addIssue({ code: 'custom', message: `${leaf.type}: from must be before to` });
    }
  }
});

export const rewardSchema = z.object({ kind: z.enum(COSMETIC_KINDS as [string, ...string[]]), id: idSchema });
export const rewardsSchema = z
  .array(rewardSchema)
  .min(1)
  .max(5)
  .superRefine((rewards, ctx) => {
    if (new Set(rewards.map((r) => `${r.kind}:${r.id}`)).size !== rewards.length) {
      ctx.addIssue({ code: 'custom', message: 'rewards must be unique' });
    }
  });

const challengeFields = {
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300),
  condition: conditionTreeSchema,
  rewards: rewardsSchema,
  starts_at: localHourSchema.nullable(),
  ends_at: localHourSchema.nullable(),
};

function windowOrdered(value: { starts_at?: string | null; ends_at?: string | null }): boolean {
  return !value.starts_at || !value.ends_at || value.starts_at < value.ends_at;
}

export const createChallengeBodySchema = z
  .object({
    ...challengeFields,
    description: challengeFields.description.default(''),
    starts_at: challengeFields.starts_at.default(null),
    ends_at: challengeFields.ends_at.default(null),
  })
  .refine(windowOrdered, { message: 'starts_at must be before ends_at', path: ['starts_at'] });

export const patchChallengeBodySchema = z
  .object({
    title: challengeFields.title.optional(),
    description: challengeFields.description.optional(),
    condition: challengeFields.condition.optional(),
    rewards: challengeFields.rewards.optional(),
    starts_at: challengeFields.starts_at.optional(),
    ends_at: challengeFields.ends_at.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), { message: 'nothing to update', path: ['title'] });

export type CreateChallengeInput = z.infer<typeof createChallengeBodySchema>;
export type PatchChallengeInput = z.infer<typeof patchChallengeBodySchema>;

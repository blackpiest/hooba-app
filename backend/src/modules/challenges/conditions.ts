import { Prisma, type ActivityKind } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { channelScope, gameScope } from '../activity/activity.service.js';
import { canUseCosmetic, type CosmeticAccess, type CosmeticKind } from '../cosmetics/cosmetic-access.js';
import { isGroup, type Condition, type ConditionNode } from './challenge-schema.js';

/**
 * Контекст одного прогона: пояс сообщества, окно испытания (местное время) и ленивые общие данные пользователя.
 * Окно испытания сужает периоды всех условий: «100 сообщений за неделю ивента» считает только эту неделю.
 */
export type EvalContext = {
  userId: number;
  timezone: string;
  window: { from: string | null; to: string | null };
  access: () => Promise<CosmeticAccess>;
  completedChallengeIds: () => Promise<ReadonlySet<number>>;
};

export type LeafProgress = { condition: Condition; current: number; target: number; done: boolean };
export type GroupProgress = { op: 'all' | 'any'; ratio: number; done: boolean; items: NodeProgress[] };
export type NodeProgress = LeafProgress | GroupProgress;

/** Пересечение периода условия с окном испытания. Строки `YYYY-MM-DDTHH:00` сравниваются лексикографически. */
function effectivePeriod(
  window: EvalContext['window'],
  from: string | undefined,
  to: string | undefined,
): { from: string | null; to: string | null } {
  const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : (a ?? b));
  const earlier = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : (a ?? b));
  return { from: later(window.from, from ?? null), to: earlier(window.to, to ?? null) };
}

/** Местное время сообщества → UTC-час копилки (`hour` хранится без пояса, в UTC). */
function periodSql(timezone: string, period: { from: string | null; to: string | null }): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];
  if (period.from) {
    parts.push(Prisma.sql`"hour" >= ((${period.from}::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC')`);
  }
  if (period.to) {
    parts.push(Prisma.sql`"hour" < ((${period.to}::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC')`);
  }
  return parts;
}

async function sumActivity(
  ctx: EvalContext,
  kind: ActivityKind,
  scopes: string[] | undefined,
  period: { from: string | null; to: string | null },
): Promise<number> {
  const where = [
    Prisma.sql`"userId" = ${ctx.userId}`,
    Prisma.sql`"kind" = ${kind}::"ActivityKind"`,
    ...(scopes ? [Prisma.sql`"scope" = ANY(${scopes}::text[])`] : []),
    ...periodSql(ctx.timezone, period),
  ];
  const rows = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM("value"), 0)::int AS total FROM "ActivityHour" WHERE ${Prisma.join(where, ' AND ')}`;
  return rows[0]?.total ?? 0;
}

/** Календарный день в поясе сообщества для UTC-часа копилки. */
function localDaySql(timezone: string): Prisma.Sql {
  return Prisma.sql`((("hour" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date)`;
}

/** Разные дни с любой активностью (сообщение, голос, игра, онлайн). */
async function activeDays(ctx: EvalContext, period: { from: string | null; to: string | null }): Promise<number> {
  const where = [Prisma.sql`"userId" = ${ctx.userId}`, ...periodSql(ctx.timezone, period)];
  const rows = await prisma.$queryRaw<{ days: number }[]>`
    SELECT COUNT(DISTINCT ${localDaySql(ctx.timezone)})::int AS days FROM "ActivityHour" WHERE ${Prisma.join(where, ' AND ')}`;
  return rows[0]?.days ?? 0;
}

/** Лучшая серия подряд идущих активных дней (острова в последовательности дат). */
async function bestStreak(ctx: EvalContext, period: { from: string | null; to: string | null }): Promise<number> {
  const where = [Prisma.sql`"userId" = ${ctx.userId}`, ...periodSql(ctx.timezone, period)];
  const rows = await prisma.$queryRaw<{ streak: number }[]>`
    SELECT COALESCE(MAX(len), 0)::int AS streak FROM (
      SELECT COUNT(*) AS len FROM (
        SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int AS island
        FROM (SELECT DISTINCT ${localDaySql(ctx.timezone)} AS day FROM "ActivityHour" WHERE ${Prisma.join(where, ' AND ')}) days
      ) numbered GROUP BY island
    ) islands`;
  return rows[0]?.streak ?? 0;
}

/** Приглашённые по моим кодам, которые всё ещё в сообществе. */
async function invitesJoined(ctx: EvalContext): Promise<number> {
  return prisma.user.count({ where: { invitedById: ctx.userId, isActive: true, kickedAt: null } });
}

/** Текущее значение и цель условия. */
async function leafValue(condition: Condition, ctx: EvalContext): Promise<{ current: number; target: number }> {
  switch (condition.type) {
    case 'messages': {
      const period = effectivePeriod(ctx.window, condition.from, condition.to);
      return { current: await sumActivity(ctx, 'MESSAGE', condition.channel_ids?.map(channelScope), period), target: condition.count };
    }
    case 'voice_minutes': {
      const period = effectivePeriod(ctx.window, condition.from, condition.to);
      return { current: await sumActivity(ctx, 'VOICE', condition.channel_ids?.map(channelScope), period), target: condition.minutes };
    }
    case 'game_minutes': {
      const period = effectivePeriod(ctx.window, condition.from, condition.to);
      return { current: await sumActivity(ctx, 'GAME', condition.games?.map(gameScope), period), target: condition.minutes };
    }
    case 'online_minutes': {
      const period = effectivePeriod(ctx.window, condition.from, condition.to);
      return { current: await sumActivity(ctx, 'ONLINE', undefined, period), target: condition.minutes };
    }
    case 'active_days':
      return { current: await activeDays(ctx, effectivePeriod(ctx.window, condition.from, condition.to)), target: condition.days };
    case 'streak_days':
      return { current: await bestStreak(ctx, effectivePeriod(ctx.window, undefined, undefined)), target: condition.days };
    case 'invites_joined':
      return { current: await invitesJoined(ctx), target: condition.count };
    case 'has_cosmetic':
      return {
        current: canUseCosmetic(await ctx.access(), condition.kind as CosmeticKind, condition.item_id) ? 1 : 0,
        target: 1,
      };
    case 'challenge_done':
      return { current: (await ctx.completedChallengeIds()).has(condition.challenge_id) ? 1 : 0, target: 1 };
  }
}

function ratioOf(node: NodeProgress): number {
  return 'op' in node ? node.ratio : Math.min(1, node.current / node.target);
}

/**
 * Прогресс дерева: «все» — выполнено, когда выполнены все ветки, доля — среднее (каждая ветка не больше 1);
 * «любое» — выполнено по любой ветке, доля — лучшая ветка.
 */
export async function evaluateNode(node: ConditionNode, ctx: EvalContext): Promise<NodeProgress> {
  if (!isGroup(node)) {
    const { current, target } = await leafValue(node, ctx);
    return { condition: node, current: Math.min(current, target), target, done: current >= target };
  }
  const items: NodeProgress[] = [];
  for (const item of node.items) {
    items.push(await evaluateNode(item, ctx));
  }
  const ratios = items.map(ratioOf);
  return node.op === 'all'
    ? { op: 'all', items, done: items.every((item) => item.done), ratio: ratios.reduce((a, b) => a + b, 0) / ratios.length }
    : { op: 'any', items, done: items.some((item) => item.done), ratio: Math.max(0, ...ratios) };
}

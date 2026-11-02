import type { Challenge } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { onActivityRecorded } from '../activity/activity.service.js';
import { loadCosmeticAccess, parseRewards, toDbKind, type CosmeticAccess } from '../cosmetics/cosmetic-access.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { getCommunityTimezone } from '../server-settings/server-settings.service.js';
import { conditionTreeSchema } from './challenge-schema.js';
import { localNow, windowOpen } from './community-time.js';
import { evaluateNode, type EvalContext, type GroupProgress } from './conditions.js';

export const EVALUATE_INTERVAL_MS = 30_000;

/** Пользователи, у которых что-то изменилось с прошлого прогона. */
const dirty = new Set<number>();

export function markChallengeDirty(userIds: Iterable<number>): void {
  for (const id of userIds) {
    dirty.add(id);
  }
}

onActivityRecorded((userIds) => markChallengeDirty(userIds));

/** Окно испытания в местном времени сообщества. */
export function challengeWindow(challenge: Pick<Challenge, 'startsAt' | 'endsAt'>) {
  return { from: challenge.startsAt, to: challenge.endsAt };
}

/** Контекст с ленивыми общими данными пользователя: доступ к косметике и выполненные испытания грузятся по требованию. */
export function evalContext(userId: number, timezone: string, window: EvalContext['window']): EvalContext {
  let access: Promise<CosmeticAccess> | null = null;
  let completed: Promise<ReadonlySet<number>> | null = null;
  return {
    userId,
    timezone,
    window,
    access: () => (access ??= loadCosmeticAccess(userId)),
    completedChallengeIds: () =>
      (completed ??= prisma.challengeCompletion
        .findMany({ where: { userId }, select: { challengeId: true } })
        .then((rows) => new Set(rows.map((row) => row.challengeId)))),
  };
}

/** Прогресс пользователя по испытанию. Битое условие в БД (схема поменялась) — null, испытание пропускается. */
export async function challengeProgress(
  challenge: Challenge,
  userId: number,
  timezone: string,
): Promise<GroupProgress | null> {
  const tree = conditionTreeSchema.safeParse(challenge.condition);
  if (!tree.success) {
    return null;
  }
  return (await evaluateNode(tree.data, evalContext(userId, timezone, challengeWindow(challenge)))) as GroupProgress;
}

/**
 * Засчитать испытание: отметка о выполнении и награды одной транзакцией. Повторный вызов ничего не делает.
 * Награды остаются навсегда — правка или архивация испытания их не отзывает.
 */
async function completeChallenge(challenge: Challenge, userId: number): Promise<boolean> {
  const rewards = parseRewards(challenge.rewards);
  const done = await prisma.$transaction(async (tx) => {
    const created = await tx.challengeCompletion.createMany({
      data: [{ challengeId: challenge.id, userId }],
      skipDuplicates: true,
    });
    if (created.count === 0) {
      return false;
    }
    await tx.userCosmetic.createMany({
      data: rewards.map((reward) => ({
        userId,
        kind: toDbKind(reward.kind),
        itemId: reward.id,
        source: 'CHALLENGE' as const,
        challengeId: challenge.id,
      })),
      skipDuplicates: true,
    });
    return true;
  });
  if (done) {
    publishRealtimeEvent('internal:challenge_completed', {
      user_id: userId,
      challenge_id: challenge.id,
      title: challenge.title,
      rewards,
    });
    // Подсказка у кнопки профиля: тост легко пропустить, а она висит до просмотра.
    publishRealtimeEvent('internal:profile_news', { user_id: userId });
  }
  return done;
}

let running: Promise<void> | null = null;

/**
 * Проверить активные испытания в открытом окне у этих пользователей (или у всех активных — `null`).
 * `challengeIds` сужает набор испытаний (после публикации — только новое). Выполнение одного испытания
 * может открыть цепочку (`challenge_done`, `has_cosmetic`), поэтому пользователь проверяется до тех пор, пока что-то выполняется.
 */
export async function evaluateChallenges(
  userIds: readonly number[] | null,
  challengeIds?: readonly number[],
): Promise<void> {
  const timezone = await getCommunityTimezone();
  const now = localNow(timezone);
  const challenges = (
    await prisma.challenge.findMany({
      where: { status: 'ACTIVE', ...(challengeIds ? { id: { in: [...challengeIds] } } : {}) },
      orderBy: { id: 'asc' },
    })
  ).filter((challenge) => windowOpen(challengeWindow(challenge), now));
  if (challenges.length === 0) {
    return;
  }
  const users = await prisma.user.findMany({
    where: { isActive: true, kickedAt: null, ...(userIds ? { id: { in: [...userIds] } } : {}) },
    select: { id: true, challengesDone: { select: { challengeId: true } } },
  });
  for (const user of users) {
    const completed = new Set(user.challengesDone.map((row) => row.challengeId));
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const challenge of challenges) {
        if (completed.has(challenge.id)) continue;
        const progress = await challengeProgress(challenge, user.id, timezone);
        if (progress?.done && (await completeChallenge(challenge, user.id))) {
          completed.add(challenge.id);
          progressed = true;
        }
      }
      // Цепочки: следующий круг — только если что-то выполнилось и есть ещё невыполненные.
      progressed &&= challenges.some((challenge) => !completed.has(challenge.id));
    }
  }
}

/** Проверить накопившихся «грязных». Прогоны не пересекаются: следующий ждёт текущий. */
export function flushDirtyChallenges(): Promise<void> {
  const run = (running ?? Promise.resolve()).then(async () => {
    if (dirty.size === 0) return;
    const batch = [...dirty];
    dirty.clear();
    await evaluateChallenges(batch);
  });
  running = run.finally(() => {
    if (running === run) running = null;
  });
  return run;
}

/** Таймер оценщика и стартовый полный прогон (испытания, созданные миграцией, и всё, что накопилось офлайн). */
export function startChallengeEvaluator(onError: (error: unknown) => void): () => void {
  void evaluateChallenges(null).catch(onError);
  const timer = setInterval(() => {
    void flushDirtyChallenges().catch(onError);
  }, EVALUATE_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

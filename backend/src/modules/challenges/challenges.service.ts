import type { Challenge, ChallengeStatus, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { loadAvatarCatalog, type AvatarCatalog } from '../avatars/avatar-catalog.js';
import {
  invalidateRewardLocks,
  keepForWearers,
  parseRewards,
  type CosmeticKind,
  type CosmeticReward,
} from '../cosmetics/cosmetic-access.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { getCommunityTimezone } from '../server-settings/server-settings.service.js';
import {
  conditionLeaves,
  conditionTreeSchema,
  type ConditionGroup,
  type CreateChallengeInput,
  type PatchChallengeInput,
} from './challenge-schema.js';
import { challengeProgress, evaluateChallenges } from './challenge-evaluator.js';
import { localNow, windowOpen } from './community-time.js';
import type { GroupProgress } from './conditions.js';

export type ChallengeDto = {
  id: number;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
  condition: ConditionGroup | null;
  rewards: CosmeticReward[];
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  /** Сколько участников выполнили. */
  completions: number;
};

function toDto(row: Challenge & { _count?: { completions: number } }): ChallengeDto {
  const tree = conditionTreeSchema.safeParse(row.condition);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status.toLowerCase() as ChallengeDto['status'],
    condition: tree.success ? tree.data : null,
    rewards: parseRewards(row.rewards),
    starts_at: row.startsAt,
    ends_at: row.endsAt,
    published_at: row.publishedAt?.toISOString() ?? null,
    completions: row._count?.completions ?? 0,
  };
}

const WITH_COUNT = { _count: { select: { completions: true } } } as const;

function onError(error: unknown): void {
  console.error('[challenges] evaluate', error);
}

async function loadChallenge(id: number): Promise<Challenge> {
  const row = await prisma.challenge.findUnique({ where: { id } });
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Challenge not found');
  }
  return row;
}

function catalogList(catalog: AvatarCatalog, kind: CosmeticKind): { id: string }[] {
  return { badge: catalog.badges, title: catalog.titles, frame: catalog.frames, background: catalog.backgrounds, character: catalog.characters }[kind];
}

/** Награды и ссылки условий указывают на то, что существует. Значок роли наградой быть не может. */
async function assertReferences(
  rewards: CosmeticReward[] | undefined,
  condition: ConditionGroup | undefined,
  selfId: number | null,
): Promise<void> {
  const catalog = await loadAvatarCatalog();
  for (const reward of rewards ?? []) {
    if (!catalogList(catalog, reward.kind).some((item) => item.id === reward.id)) {
      throw new AppError('VALIDATION_ERROR', 400, `rewards: unknown ${reward.kind} ${reward.id}`);
    }
    if (reward.kind === 'badge' && catalog.badges.find((item) => item.id === reward.id)?.category === 'role') {
      throw new AppError('VALIDATION_ERROR', 400, 'rewards: role badges come with roles');
    }
  }
  for (const leaf of condition ? conditionLeaves(condition) : []) {
    if (leaf.type === 'has_cosmetic' && !catalogList(catalog, leaf.kind as CosmeticKind).some((item) => item.id === leaf.item_id)) {
      throw new AppError('VALIDATION_ERROR', 400, `condition: unknown ${leaf.kind} ${leaf.item_id}`);
    }
    if (leaf.type === 'challenge_done') {
      if (leaf.challenge_id === selfId || !(await prisma.challenge.findUnique({ where: { id: leaf.challenge_id }, select: { id: true } }))) {
        throw new AppError('VALIDATION_ERROR', 400, 'condition: unknown challenge');
      }
    }
  }
}

/** Каталог испытаний изменился: сбросить кэш закрытых предметов и сказать клиентам перечитать. */
function catalogChanged(): void {
  invalidateRewardLocks();
  publishRealtimeEvent('challenges:changed', {});
}

async function logChallenge(actorId: number, action: 'CHALLENGE_PUBLISH' | 'CHALLENGE_ARCHIVE', title: string): Promise<void> {
  await prisma.moderationLog.create({ data: { actorId, action, reason: title } });
}

export async function listChallenges(): Promise<ChallengeDto[]> {
  const rows = await prisma.challenge.findMany({ include: WITH_COUNT, orderBy: [{ status: 'asc' }, { id: 'desc' }] });
  return rows.map(toDto);
}

export async function createChallenge(actorId: number, input: CreateChallengeInput): Promise<ChallengeDto> {
  const rewards = input.rewards as CosmeticReward[];
  await assertReferences(rewards, input.condition, null);
  const row = await prisma.challenge.create({
    data: {
      title: input.title,
      description: input.description,
      condition: input.condition as Prisma.InputJsonValue,
      rewards: rewards as Prisma.InputJsonValue,
      startsAt: input.starts_at,
      endsAt: input.ends_at,
      createdById: actorId,
    },
    include: WITH_COUNT,
  });
  return toDto(row);
}

/**
 * Правка разрешена в любом статусе: выполненное не отзывается. У активного испытания новые награды
 * закрываются (с LEGACY носившим), и всех проверяют заново — правка могла облегчить условия.
 */
export async function updateChallenge(id: number, input: PatchChallengeInput): Promise<ChallengeDto> {
  const current = await loadChallenge(id);
  const rewards = input.rewards as CosmeticReward[] | undefined;
  await assertReferences(rewards, input.condition, id);
  const startsAt = input.starts_at !== undefined ? input.starts_at : current.startsAt;
  const endsAt = input.ends_at !== undefined ? input.ends_at : current.endsAt;
  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new AppError('VALIDATION_ERROR', 400, 'starts_at must be before ends_at');
  }
  const live = current.status !== 'DRAFT';
  if (live && rewards) {
    await keepForWearers(rewards);
  }
  const row = await prisma.challenge.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.condition !== undefined ? { condition: input.condition as Prisma.InputJsonValue } : {}),
      ...(rewards !== undefined ? { rewards: rewards as Prisma.InputJsonValue } : {}),
      startsAt,
      endsAt,
    },
    include: WITH_COUNT,
  });
  if (live) {
    catalogChanged();
  }
  if (row.status === 'ACTIVE') {
    void evaluateChallenges(null, [row.id]).catch(onError);
  }
  return toDto(row);
}

async function setStatus(actorId: number, id: number, status: ChallengeStatus): Promise<ChallengeDto> {
  const current = await loadChallenge(id);
  if (current.status === status) {
    return toDto({ ...current, _count: { completions: await prisma.challengeCompletion.count({ where: { challengeId: id } }) } });
  }
  if (status === 'ACTIVE') {
    // Перед публикацией условие и награды должны быть живыми: каталог мог поменяться с сохранения черновика.
    const tree = conditionTreeSchema.safeParse(current.condition);
    if (!tree.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'condition: invalid');
    }
    const rewards = parseRewards(current.rewards);
    await assertReferences(rewards, tree.data, id);
    await keepForWearers(rewards);
  }
  const row = await prisma.challenge.update({
    where: { id },
    data: { status, ...(status === 'ACTIVE' && !current.publishedAt ? { publishedAt: new Date() } : {}) },
    include: WITH_COUNT,
  });
  await logChallenge(actorId, status === 'ACTIVE' ? 'CHALLENGE_PUBLISH' : 'CHALLENGE_ARCHIVE', row.title);
  catalogChanged();
  if (status === 'ACTIVE') {
    // Старожилы получают награду сразу: история сообщений уже в копилках.
    void evaluateChallenges(null, [row.id]).catch(onError);
  }
  return toDto(row);
}

export const publishChallenge = (actorId: number, id: number) => setStatus(actorId, id, 'ACTIVE');
export const archiveChallenge = (actorId: number, id: number) => setStatus(actorId, id, 'ARCHIVED');

/** Удаляется только черновик: у опубликованного есть получатели и закрытые им предметы. */
export async function deleteChallenge(id: number): Promise<void> {
  const current = await loadChallenge(id);
  if (current.status !== 'DRAFT') {
    throw new AppError('CHALLENGE_PUBLISHED', 409, 'Only drafts can be deleted; archive instead');
  }
  await prisma.challenge.delete({ where: { id } });
}

export type ChallengeStandingDto = { user_id: number; ratio: number; completed_at: string | null };

/** Для владельца: прогресс всех участников по испытанию, выполнившие — первыми. */
export async function challengeStandings(id: number): Promise<ChallengeStandingDto[]> {
  const challenge = await loadChallenge(id);
  const timezone = await getCommunityTimezone();
  const [users, completions] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true, kickedAt: null }, select: { id: true } }),
    prisma.challengeCompletion.findMany({ where: { challengeId: id } }),
  ]);
  const doneAt = new Map(completions.map((row) => [row.userId, row.completedAt.toISOString()]));
  const out: ChallengeStandingDto[] = [];
  for (const user of users) {
    const completedAt = doneAt.get(user.id) ?? null;
    const progress = completedAt ? null : await challengeProgress(challenge, user.id, timezone);
    out.push({ user_id: user.id, ratio: completedAt ? 1 : (progress?.ratio ?? 0), completed_at: completedAt });
  }
  return out.sort((a, b) => b.ratio - a.ratio || (a.completed_at ?? '').localeCompare(b.completed_at ?? ''));
}

/** Окно по часам сообщества: ещё не началось, идёт, закончилось (или испытание в архиве). */
export type ChallengeWindowState = 'upcoming' | 'open' | 'ended';

export type MyChallengeDto = Omit<ChallengeDto, 'completions' | 'published_at'> & {
  window: ChallengeWindowState;
  completed_at: string | null;
  /** Прогресс по дереву условий; у выполненного — null. */
  progress: GroupProgress | null;
};

/**
 * Испытания участника: активные (с прогрессом) и выполненные архивные. Черновики не видны.
 * Условия отдаются целиком — клиент сам пишет «Провести 5 ч в голосовых каналах».
 */
export async function myChallenges(userId: number): Promise<MyChallengeDto[]> {
  const timezone = await getCommunityTimezone();
  const now = localNow(timezone);
  const [rows, completions] = await Promise.all([
    prisma.challenge.findMany({ where: { status: { in: ['ACTIVE', 'ARCHIVED'] } }, orderBy: { id: 'asc' } }),
    prisma.challengeCompletion.findMany({ where: { userId } }),
  ]);
  const doneAt = new Map(completions.map((row) => [row.challengeId, row.completedAt.toISOString()]));
  const out: MyChallengeDto[] = [];
  for (const row of rows) {
    const completedAt = doneAt.get(row.id) ?? null;
    if (row.status === 'ARCHIVED' && !completedAt) continue;
    const dto = toDto(row);
    const window: ChallengeWindowState =
      row.status !== 'ACTIVE' || (row.endsAt !== null && now >= row.endsAt)
        ? 'ended'
        : windowOpen({ from: row.startsAt, to: row.endsAt }, now)
          ? 'open'
          : 'upcoming';
    out.push({
      id: dto.id,
      title: dto.title,
      description: dto.description,
      status: dto.status,
      condition: dto.condition,
      rewards: dto.rewards,
      starts_at: dto.starts_at,
      ends_at: dto.ends_at,
      window,
      completed_at: completedAt,
      progress: completedAt ? null : await challengeProgress(row, userId, timezone),
    });
  }
  return out;
}

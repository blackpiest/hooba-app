import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Встроенные испытания. Создаются миграцией `challenges` (заменили условие каталога `unlock: personal_invite`);
 * здесь — зеркало для тестового harness, который пересоздаёт БД. Менять синхронно с миграцией.
 */
export const DEFAULT_CHALLENGES: Prisma.ChallengeCreateManyInput[] = [
  {
    title: 'Пригласи друга',
    description: 'Кто-нибудь зарегистрировался по твоему личному приглашению.',
    status: 'ACTIVE',
    condition: { op: 'all', items: [{ type: 'invites_joined', count: 1 }] },
    rewards: [{ kind: 'frame', id: 'inviter' }],
    publishedAt: new Date(),
  },
];

export async function insertDefaultChallenges(prisma: PrismaClient): Promise<void> {
  await prisma.challenge.createMany({ data: DEFAULT_CHALLENGES });
}

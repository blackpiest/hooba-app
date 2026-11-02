import type { Prisma, PrismaClient, User } from '@prisma/client';

type UserLookupDb = Prisma.TransactionClient | PrismaClient;

export async function findUserByUsername(db: UserLookupDb, username: string): Promise<User | null> {
  return db.user.findFirst({
    where: {
      username: { equals: username.trim(), mode: 'insensitive' },
    },
  });
}

-- AlterTable
ALTER TABLE "UserCosmetic" ADD COLUMN     "seenAt" TIMESTAMP(3);

-- Выдачи, которые участник уже видел в конструкторе, метку «Новое» не получают.
UPDATE "UserCosmetic" AS uc
SET "seenAt" = now()
FROM "User" AS u
WHERE u."id" = uc."userId"
  AND (uc."source" = 'LEGACY' OR uc."createdAt" <= u."profileSeenAt");

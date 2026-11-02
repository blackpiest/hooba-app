-- CreateEnum
CREATE TYPE "CosmeticKind" AS ENUM ('BADGE', 'TITLE', 'FRAME', 'BACKGROUND', 'CHARACTER');

-- CreateEnum
CREATE TYPE "CosmeticSource" AS ENUM ('MANUAL', 'CHALLENGE', 'LEGACY');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "ModerationAction" ADD VALUE 'CHALLENGE_PUBLISH';
ALTER TYPE "ModerationAction" ADD VALUE 'CHALLENGE_ARCHIVE';

-- CreateTable
CREATE TABLE "UserCosmetic" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" "CosmeticKind" NOT NULL,
    "itemId" TEXT NOT NULL,
    "source" "CosmeticSource" NOT NULL,
    "challengeId" INTEGER,
    "grantedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCosmetic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ChallengeStatus" NOT NULL DEFAULT 'DRAFT',
    "condition" JSONB NOT NULL,
    "rewards" JSONB NOT NULL,
    "startsAt" TEXT,
    "endsAt" TEXT,
    "createdById" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeCompletion" (
    "challengeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeCompletion_pkey" PRIMARY KEY ("challengeId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCosmetic_userId_kind_itemId_key" ON "UserCosmetic"("userId", "kind", "itemId");

-- CreateIndex
CREATE INDEX "Challenge_status_idx" ON "Challenge"("status");

-- CreateIndex
CREATE INDEX "ChallengeCompletion_userId_idx" ON "ChallengeCompletion"("userId");

-- AddForeignKey
ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeCompletion" ADD CONSTRAINT "ChallengeCompletion_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeCompletion" ADD CONSTRAINT "ChallengeCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Выданные вручную значки и титулы переезжают в общую таблицу косметики.
INSERT INTO "UserCosmetic" ("userId", "kind", "itemId", "source", "grantedById", "createdAt")
SELECT "userId", 'BADGE', "badgeId", 'MANUAL', "grantedById", "createdAt" FROM "UserBadge";
INSERT INTO "UserCosmetic" ("userId", "kind", "itemId", "source", "grantedById", "createdAt")
SELECT "userId", 'TITLE', "titleId", 'MANUAL', "grantedById", "createdAt" FROM "UserTitle";

-- DropTable
DROP TABLE "UserBadge";
DROP TABLE "UserTitle";

-- Условие каталога `unlock: personal_invite` у рамки «inviter» становится обычным испытанием.
-- Зеркало: DEFAULT_CHALLENGES в src/modules/challenges/default-challenges.ts. Награды уже открывших
-- раздаст первый прогон оценщика при старте сервера.
INSERT INTO "Challenge" ("title", "description", "status", "condition", "rewards", "publishedAt", "updatedAt")
VALUES (
  'Пригласи друга',
  'Кто-нибудь зарегистрировался по твоему личному приглашению.',
  'ACTIVE',
  '{"op":"all","items":[{"type":"invites_joined","count":1}]}',
  '[{"kind":"frame","id":"inviter"}]',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

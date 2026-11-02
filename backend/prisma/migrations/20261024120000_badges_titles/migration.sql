-- AlterEnum
ALTER TYPE "ModerationAction" ADD VALUE 'COSMETIC_GRANT';
ALTER TYPE "ModerationAction" ADD VALUE 'COSMETIC_REVOKE';

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "badgeId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinnedBadges" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "titleId" TEXT;

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "badgeId" TEXT NOT NULL,
    "grantedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTitle" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "titleId" TEXT NOT NULL,
    "grantedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTitle_userId_titleId_key" ON "UserTitle"("userId", "titleId");

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTitle" ADD CONSTRAINT "UserTitle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTitle" ADD CONSTRAINT "UserTitle_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Значки системных ролей по умолчанию (id из assets/avatars/catalog.json). Владелец может сменить в настройках роли.
UPDATE "Role" SET "badgeId" = 'founder' WHERE "key" = 'OWNER' AND "badgeId" IS NULL;
UPDATE "Role" SET "badgeId" = 'admin' WHERE "key" = 'ADMIN' AND "badgeId" IS NULL;

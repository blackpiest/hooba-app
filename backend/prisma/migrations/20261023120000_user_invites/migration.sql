-- AlterEnum
ALTER TYPE "ModerationAction" ADD VALUE 'USER_INVITES_ENABLE';
ALTER TYPE "ModerationAction" ADD VALUE 'USER_INVITES_DISABLE';

-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('STAFF', 'PERSONAL');

-- AlterTable
ALTER TABLE "ServerSettings" ADD COLUMN "userInvitesEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "invitedById" INTEGER;

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN "kind" "InviteKind" NOT NULL DEFAULT 'STAFF',
ADD COLUMN "slot" INTEGER;

-- CreateIndex
CREATE INDEX "User_invitedById_idx" ON "User"("invitedById");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_createdById_kind_slot_key" ON "Invite"("createdById", "kind", "slot");

-- Привязка уже случившихся регистраций: кто создал использованный инвайт.
UPDATE "User" u SET "invitedById" = i."createdById"
FROM "Invite" i WHERE i."usedById" = u."id" AND u."invitedById" IS NULL AND i."createdById" <> u."id";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

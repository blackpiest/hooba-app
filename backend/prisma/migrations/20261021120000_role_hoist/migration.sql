-- AlterTable
ALTER TABLE "Role" ADD COLUMN "hoist" BOOLEAN NOT NULL DEFAULT false;

-- Системные роли (кроме MEMBER) теперь в общем порядке: OWNER, ADMIN, затем кастомные в прежнем порядке.
UPDATE "Role" SET "position" = "position" + 2 WHERE "key" IS NULL;
UPDATE "Role" SET "position" = 0 WHERE "key" = 'OWNER';
UPDATE "Role" SET "position" = 1 WHERE "key" = 'ADMIN';
UPDATE "Role" SET "position" = 0 WHERE "key" = 'MEMBER';

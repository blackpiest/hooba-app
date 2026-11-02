-- AlterEnum
ALTER TYPE "ModerationAction" ADD VALUE 'DISPLAY_NAME_HIDE';
ALTER TYPE "ModerationAction" ADD VALUE 'DISPLAY_NAME_UNHIDE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayNameLocked" BOOLEAN NOT NULL DEFAULT false;

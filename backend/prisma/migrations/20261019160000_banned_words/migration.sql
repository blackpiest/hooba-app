-- AlterTable
ALTER TABLE "ServerSettings" ADD COLUMN "bannedWords" TEXT[] DEFAULT ARRAY[]::TEXT[];

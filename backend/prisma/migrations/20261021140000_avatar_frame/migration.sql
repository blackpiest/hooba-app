-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarFrame" TEXT;

-- Старые пресеты (char-N, bg-N) удалены из каталога: выбор сбрасывается на буквенный аватар.
UPDATE "User" SET "avatarCharacter" = NULL, "avatarBackground" = NULL;

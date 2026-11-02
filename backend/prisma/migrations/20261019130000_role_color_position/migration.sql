-- AlterTable
ALTER TABLE "Role" ADD COLUMN "color" TEXT,
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Цвета бейджей, которые раньше были зашиты в клиенте (frontend/src/shared/roles.ts).
UPDATE "Role" SET "color" = '#f0b232' WHERE "key" = 'OWNER';
UPDATE "Role" SET "color" = '#f23f43' WHERE "key" = 'ADMIN';

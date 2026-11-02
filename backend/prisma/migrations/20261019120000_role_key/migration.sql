-- AlterTable
ALTER TABLE "Role" ADD COLUMN "key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- Системные роли получают неизменный ключ; имя MEMBER становится отображаемым «Нормис».
UPDATE "Role" SET "key" = "name", "isSystem" = true WHERE "name" IN ('OWNER', 'ADMIN', 'MEMBER');
UPDATE "Role" SET "name" = 'Нормис' WHERE "key" = 'MEMBER'
  AND NOT EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'Нормис');

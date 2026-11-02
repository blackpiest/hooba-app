-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('MESSAGE', 'VOICE', 'GAME', 'ONLINE');

-- AlterTable
ALTER TABLE "ServerSettings" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow';

-- CreateTable
CREATE TABLE "ActivityHour" (
    "userId" INTEGER NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "value" INTEGER NOT NULL,

    CONSTRAINT "ActivityHour_pkey" PRIMARY KEY ("userId","hour","kind","scope")
);

-- CreateIndex
CREATE INDEX "ActivityHour_userId_kind_hour_idx" ON "ActivityHour"("userId", "kind", "hour");

-- AddForeignKey
ALTER TABLE "ActivityHour" ADD CONSTRAINT "ActivityHour_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- История: сообщения засчитываются задним числом (неудалённые, по часу и каналу).
-- Голос, игры и онлайн раньше не записывались — их копилки начинаются с этой миграции.
INSERT INTO "ActivityHour" ("userId", "hour", "kind", "scope", "value")
SELECT "authorId", date_trunc('hour', "createdAt"), 'MESSAGE', 'ch:' || "channelId", COUNT(*)::int
FROM "Message"
WHERE "isDeleted" = false
GROUP BY "authorId", date_trunc('hour', "createdAt"), "channelId";

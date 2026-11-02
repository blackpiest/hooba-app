-- AlterEnum
ALTER TYPE "ModerationAction" ADD VALUE 'ANNOUNCEMENT_CREATE';
ALTER TYPE "ModerationAction" ADD VALUE 'ANNOUNCEMENT_DELETE';

-- CreateTable
CREATE TABLE "Announcement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "showAt" TEXT NOT NULL,
    "expiresAt" TEXT,
    "roleIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "userIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdById" INTEGER,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRecipient" (
    "announcementId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "AnnouncementRecipient_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateIndex
CREATE INDEX "Announcement_deliveredAt_showAt_idx" ON "Announcement"("deliveredAt", "showAt");

-- CreateIndex
CREATE INDEX "AnnouncementRecipient_userId_seenAt_idx" ON "AnnouncementRecipient"("userId", "seenAt");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRecipient" ADD CONSTRAINT "AnnouncementRecipient_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRecipient" ADD CONSTRAINT "AnnouncementRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


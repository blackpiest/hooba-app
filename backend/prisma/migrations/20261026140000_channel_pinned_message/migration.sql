-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedById" INTEGER,
ADD COLUMN     "pinnedMessageId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Channel_pinnedMessageId_key" ON "Channel"("pinnedMessageId");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_pinnedMessageId_fkey" FOREIGN KEY ("pinnedMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CosmeticText" ADD COLUMN     "badge" TEXT,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CustomTitle" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "badgeId" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomTitle_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CustomTitle" ADD CONSTRAINT "CustomTitle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

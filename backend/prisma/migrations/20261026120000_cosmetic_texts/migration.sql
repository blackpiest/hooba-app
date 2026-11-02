-- AlterEnum
ALTER TYPE "ModerationAction" ADD VALUE 'COSMETIC_EDIT';

-- CreateTable
CREATE TABLE "CosmeticText" (
    "kind" "CosmeticKind" NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "category" TEXT,
    "hint" TEXT,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CosmeticText_pkey" PRIMARY KEY ("kind","itemId")
);

-- AddForeignKey
ALTER TABLE "CosmeticText" ADD CONSTRAINT "CosmeticText_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

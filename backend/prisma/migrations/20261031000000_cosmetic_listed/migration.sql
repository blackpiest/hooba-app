-- AlterTable
ALTER TABLE "CosmeticText" ADD COLUMN     "listed" BOOLEAN;

-- AlterTable
ALTER TABLE "CustomTitle" ADD COLUMN     "listed" BOOLEAN NOT NULL DEFAULT true;

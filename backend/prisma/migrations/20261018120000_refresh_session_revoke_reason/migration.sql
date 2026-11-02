-- CreateEnum
CREATE TYPE "RefreshRevokeReason" AS ENUM ('ROTATED', 'LOGOUT', 'FORCED');

-- AlterTable
ALTER TABLE "RefreshSession" ADD COLUMN "revokeReason" "RefreshRevokeReason";

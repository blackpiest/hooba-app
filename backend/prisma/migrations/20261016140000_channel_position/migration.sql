-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "position" INTEGER;

-- Keep the current sidebar: createdAt, then id, inside each channel type.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "channelType"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS "position"
  FROM "Channel"
)
UPDATE "Channel" AS channel
SET "position" = ranked."position"
FROM ranked
WHERE channel."id" = ranked."id";

ALTER TABLE "Channel" ALTER COLUMN "position" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Channel_channelType_position_idx" ON "Channel"("channelType", "position");

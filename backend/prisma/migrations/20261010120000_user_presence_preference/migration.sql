CREATE TYPE "PresencePreference" AS ENUM ('ONLINE', 'IDLE', 'DND', 'INVISIBLE');

ALTER TABLE "User" ADD COLUMN "presencePreference" "PresencePreference" NOT NULL DEFAULT 'ONLINE';

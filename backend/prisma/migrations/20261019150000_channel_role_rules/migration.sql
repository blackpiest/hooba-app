-- CreateEnum
CREATE TYPE "ChannelRuleAction" AS ENUM ('SEND', 'SPEAK', 'STREAM', 'VIEW');

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "sendRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "speakRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "streamRestricted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChannelRoleRule" (
    "id" SERIAL NOT NULL,
    "channelId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "action" "ChannelRuleAction" NOT NULL,

    CONSTRAINT "ChannelRoleRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRoleRule_channelId_action_roleId_key" ON "ChannelRoleRule"("channelId", "action", "roleId");

-- CreateIndex
CREATE INDEX "ChannelRoleRule_roleId_idx" ON "ChannelRoleRule"("roleId");

-- AddForeignKey
ALTER TABLE "ChannelRoleRule" ADD CONSTRAINT "ChannelRoleRule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRoleRule" ADD CONSTRAINT "ChannelRoleRule_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

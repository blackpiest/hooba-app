import type { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

/**
 * Приватный канал видят выбранные люди (ChannelMember) и обладатели выбранных ролей
 * (ChannelRoleRule с action VIEW). Staff видимость не обходит — как и раньше.
 */
export function channelVisibleWhere(userId: number): Prisma.ChannelWhereInput {
  return {
    OR: [
      { isPrivate: false },
      { members: { some: { userId } } },
      { roleRules: { some: { action: 'VIEW', role: { users: { some: { userId } } } } } },
    ],
  };
}

/** Выборка для `privateAudienceOf`. */
export const channelAudienceSelect = {
  isPrivate: true,
  members: { select: { userId: true } },
  roleRules: {
    where: { action: 'VIEW' },
    select: { roleId: true, role: { select: { users: { select: { userId: true } } } } },
  },
} as const;

type AudienceSource = {
  isPrivate: boolean;
  members: { userId: number }[];
  roleRules: { role: { users: { userId: number }[] } }[];
};

/** Кто видит канал: null — публичный (все), иначе набор user id. */
export function privateAudienceOf(channel: AudienceSource): Set<number> | null {
  if (!channel.isPrivate) {
    return null;
  }
  const audience = new Set(channel.members.map((member) => member.userId));
  for (const rule of channel.roleRules) {
    for (const holder of rule.role.users) {
      audience.add(holder.userId);
    }
  }
  return audience;
}

/** undefined — канал удалён или не найден. */
export async function loadChannelAudience(channelId: number): Promise<Set<number> | null | undefined> {
  const row = await prisma.channel.findFirst({
    where: { id: channelId, isDeleted: false },
    select: channelAudienceSelect,
  });
  return row ? privateAudienceOf(row) : undefined;
}

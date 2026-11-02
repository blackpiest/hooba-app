import type { ChannelRuleAction } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { AppError } from '../errors/app-error.js';
import { hasStaffKey, systemRoleKeysOf } from '../auth/roles.js';

/**
 * Права участника от ролей сервера. «Запрет побеждает»: действие закрыто, если его запрещает
 * хотя бы одна роль. OWNER/ADMIN обходят запреты.
 */
export type RolePermissions = {
  userId: number;
  staff: boolean;
  roleIds: number[];
  sendMessages: boolean;
  speak: boolean;
  screenShare: boolean;
  /** Картинки в чате. Действует только вместе с `sendMessages`. */
  attachFiles: boolean;
};

export type ActionPermissions = Pick<RolePermissions, 'sendMessages' | 'speak' | 'screenShare' | 'attachFiles'> & {
  /** Реакции на сообщения. Запрета на уровне роли нет — только правило канала. */
  react: boolean;
};

/** Публичная форма (`/auth/me`, каталог ролей, `my_permissions` канала): true — разрешено. */
export type PermissionsDto = {
  send_messages: boolean;
  speak: boolean;
  screen_share: boolean;
  attach_files: boolean;
};

/** `my_permissions` канала: права ролей + действия, которые есть только у канала. */
export type ChannelPermissionsDto = PermissionsDto & { react: boolean };

/**
 * Ограничения канала: null — действие доступно всем, массив — только этим ролям (и staff).
 * Пустой массив — только staff. `reactUserIds` — участники, которым реакции открыты поверх ролей.
 */
export type ChannelRules = {
  send: number[] | null;
  speak: number[] | null;
  stream: number[] | null;
  attach: number[] | null;
  react: number[] | null;
  reactUserIds: number[];
};

/** Кэш на процесс: `message:send` не ходит в БД за ролями. Сбрасывается при любом изменении ролей/каналов. */
const CACHE_TTL_MS = 60_000;
const roleCache = new Map<number, { value: RolePermissions; at: number }>();
const channelCache = new Map<number, { value: ChannelRules | null; at: number }>();
let generation = 0;

export function invalidateRolePermissions(userId?: number): void {
  generation += 1;
  if (userId === undefined) {
    roleCache.clear();
    // Удаление роли каскадом меняет правила каналов.
    channelCache.clear();
  } else {
    roleCache.delete(userId);
  }
}

export function invalidateChannelRules(channelId?: number): void {
  generation += 1;
  if (channelId === undefined) {
    channelCache.clear();
  } else {
    channelCache.delete(channelId);
  }
}

export async function getRolePermissions(userId: number): Promise<RolePermissions> {
  const hit = roleCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value;
  }
  const startedAt = generation;
  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: {
      roleId: true,
      role: { select: { key: true, denySendMessages: true, denySpeak: true, denyScreenShare: true, denyAttachFiles: true } },
    },
  });
  const roleIds = rows.map((row) => row.roleId);
  const value: RolePermissions = hasStaffKey(systemRoleKeysOf(rows))
    ? { userId, staff: true, roleIds, sendMessages: true, speak: true, screenShare: true, attachFiles: true }
    : {
        userId,
        staff: false,
        roleIds,
        sendMessages: !rows.some((row) => row.role.denySendMessages),
        speak: !rows.some((row) => row.role.denySpeak),
        screenShare: !rows.some((row) => row.role.denyScreenShare),
        attachFiles: !rows.some((row) => row.role.denyAttachFiles),
      };
  // Пока читали, роли могли поменяться — такой результат не кэшируем.
  if (startedAt === generation) {
    roleCache.set(userId, { value, at: Date.now() });
  }
  return value;
}

type ChannelRuleSource = {
  sendRestricted: boolean;
  speakRestricted: boolean;
  streamRestricted: boolean;
  attachRestricted: boolean;
  reactRestricted: boolean;
  roleRules: { action: ChannelRuleAction; roleId: number }[];
  userRules: { action: ChannelRuleAction; userId: number }[];
};

export function channelRulesOf(channel: ChannelRuleSource): ChannelRules {
  const ids = (action: ChannelRuleAction) =>
    channel.roleRules.filter((rule) => rule.action === action).map((rule) => rule.roleId);
  return {
    send: channel.sendRestricted ? ids('SEND') : null,
    speak: channel.speakRestricted ? ids('SPEAK') : null,
    stream: channel.streamRestricted ? ids('STREAM') : null,
    attach: channel.attachRestricted ? ids('ATTACH') : null,
    react: channel.reactRestricted ? ids('REACT') : null,
    reactUserIds: channel.reactRestricted
      ? channel.userRules.filter((rule) => rule.action === 'REACT').map((rule) => rule.userId)
      : [],
  };
}

/** Выборка для `channelRulesOf` — добавлять в `select` запросов каналов. */
export const channelRulesSelect = {
  sendRestricted: true,
  speakRestricted: true,
  streamRestricted: true,
  attachRestricted: true,
  reactRestricted: true,
  roleRules: { select: { action: true, roleId: true } },
  userRules: { select: { action: true, userId: true } },
} as const;

async function getChannelRules(channelId: number): Promise<ChannelRules | null> {
  const hit = channelCache.get(channelId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value;
  }
  const startedAt = generation;
  const row = await prisma.channel.findFirst({
    where: { id: channelId, isDeleted: false },
    select: channelRulesSelect,
  });
  const value = row ? channelRulesOf(row) : null;
  if (startedAt === generation) {
    channelCache.set(channelId, { value, at: Date.now() });
  }
  return value;
}

/** Право в канале = нет запрета от ролей И канал открывает действие ролям участника. Staff — всё. */
export function combinePermissions(role: RolePermissions, rules: ChannelRules | null): ActionPermissions {
  if (role.staff) {
    return { sendMessages: true, speak: true, screenShare: true, attachFiles: true, react: true };
  }
  const open = (allowed: number[] | null) => allowed === null || allowed.some((id) => role.roleIds.includes(id));
  const sendMessages = role.sendMessages && open(rules?.send ?? null);
  return {
    sendMessages,
    speak: role.speak && open(rules?.speak ?? null),
    screenShare: role.screenShare && open(rules?.stream ?? null),
    attachFiles: sendMessages && role.attachFiles && open(rules?.attach ?? null),
    react: open(rules?.react ?? null) || (rules?.reactUserIds.includes(role.userId) ?? false),
  };
}

export async function getChannelPermissions(userId: number, channelId: number): Promise<ActionPermissions> {
  const [role, rules] = await Promise.all([getRolePermissions(userId), getChannelRules(channelId)]);
  return combinePermissions(role, rules);
}

export function toPermissionsDto(p: Omit<ActionPermissions, 'react'>): PermissionsDto {
  return {
    send_messages: p.sendMessages,
    speak: p.speak,
    screen_share: p.screenShare,
    attach_files: p.attachFiles,
  };
}

export function toChannelPermissionsDto(p: ActionPermissions): ChannelPermissionsDto {
  return { ...toPermissionsDto(p), react: p.react };
}

export async function assertCanReact(userId: number, channelId: number): Promise<void> {
  if (!(await getChannelPermissions(userId, channelId)).react) {
    throw new AppError('REACT_FORBIDDEN', 403, 'You are not allowed to react here');
  }
}

export async function assertCanSendMessages(userId: number, channelId: number): Promise<void> {
  if (!(await getChannelPermissions(userId, channelId)).sendMessages) {
    throw new AppError('SEND_FORBIDDEN', 403, 'You are not allowed to send messages here');
  }
}

export async function assertCanAttachFiles(userId: number, channelId: number): Promise<void> {
  const perms = await getChannelPermissions(userId, channelId);
  if (!perms.sendMessages) {
    throw new AppError('SEND_FORBIDDEN', 403, 'You are not allowed to send messages here');
  }
  if (!perms.attachFiles) {
    throw new AppError('ATTACH_FORBIDDEN', 403, 'You are not allowed to attach files here');
  }
}

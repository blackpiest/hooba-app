import type { Channel, ChannelRuleAction, ChannelType, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import {
  channelRulesOf,
  channelRulesSelect,
  combinePermissions,
  getRolePermissions,
  invalidateChannelRules,
  toChannelPermissionsDto,
} from '../../core/permissions/permissions.js';
import {
  channelAudienceSelect,
  channelVisibleWhere,
  privateAudienceOf,
} from '../../core/permissions/channel-visibility.js';
import { evictVoiceUsersExcept } from '../voice/voice-registry.js';
import { closeVoiceRouter } from '../voice/mediasoup-voice.service.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { mergeVisibleChannelOrder } from './channels-order.js';
import { CHANNEL_NAME_MAX } from './channels.schemas.js';

const channelListOrder = [{ position: 'asc' as const }, { id: 'asc' as const }];

export function toChannelDto(row: Channel) {
  return {
    id: row.id,
    name: row.name,
    channel_type: row.channelType,
    position: row.position,
    is_private: row.isPrivate,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Ограничения канала для формы редактирования: null — всем, массив — выбранным ролям. */
export type ChannelRulesInput = {
  /** Роли, которые видят приватный канал (вдобавок к выбранным людям). */
  view?: number[];
  send?: number[] | null;
  speak?: number[] | null;
  stream?: number[] | null;
  attach?: number[] | null;
  react?: number[] | null;
  /** Участники, которым реакции открыты вдобавок к ролям `react`. */
  reactUsers?: number[];
};

const RULE_KEYS = ['send', 'speak', 'stream', 'attach', 'react'] as const;
type RuleKey = (typeof RULE_KEYS)[number];
const RULE_ACTION: Record<RuleKey, ChannelRuleAction> = {
  send: 'SEND',
  speak: 'SPEAK',
  stream: 'STREAM',
  attach: 'ATTACH',
  react: 'REACT',
};
const RULE_FLAG = {
  send: 'sendRestricted',
  speak: 'speakRestricted',
  stream: 'streamRestricted',
  attach: 'attachRestricted',
  react: 'reactRestricted',
} as const;
/** Что вообще имеет смысл ограничивать в канале этого типа. */
const RULES_FOR_TYPE: Record<'TEXT' | 'VOICE', RuleKey[]> = {
  TEXT: ['send', 'attach', 'react'],
  VOICE: ['speak', 'stream'],
};

function rulesDto(rules: ReturnType<typeof channelRulesOf>) {
  return {
    send_role_ids: rules.send,
    speak_role_ids: rules.speak,
    stream_role_ids: rules.stream,
    attach_role_ids: rules.attach,
    react_role_ids: rules.react,
    react_user_ids: rules.reactUserIds,
  };
}

function hasRules(input: ChannelRulesInput | undefined): boolean {
  return (
    input !== undefined &&
    (input.view !== undefined ||
      input.reactUsers !== undefined ||
      RULE_KEYS.some((key) => input[key] !== undefined))
  );
}

async function normalizeRules(
  channelType: ChannelType,
  isPrivate: boolean,
  input: ChannelRulesInput | undefined,
): Promise<ChannelRulesInput> {
  if (!input) {
    return {};
  }
  const allowed = channelType === 'TEXT' || channelType === 'VOICE' ? RULES_FOR_TYPE[channelType] : [];
  const out: ChannelRulesInput = {};
  const ids = new Set<number>();
  if (input.view !== undefined) {
    if (!isPrivate && input.view.length > 0) {
      throw new AppError('VALIDATION_ERROR', 400, 'view_role_ids is only allowed for a private channel');
    }
    out.view = [...new Set(input.view)];
    for (const id of out.view) ids.add(id);
  }
  for (const key of RULE_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    if (!allowed.includes(key)) {
      throw new AppError('VALIDATION_ERROR', 400, `${key}_role_ids is not applicable to ${channelType} channels`);
    }
    out[key] = value === null ? null : [...new Set(value)];
    for (const id of out[key] ?? []) ids.add(id);
  }
  if (ids.size > 0) {
    const found = await prisma.role.count({ where: { id: { in: [...ids] } } });
    if (found !== ids.size) {
      throw new AppError('VALIDATION_ERROR', 400, 'Unknown role in channel restrictions');
    }
  }
  if (input.reactUsers !== undefined) {
    if (!allowed.includes('react')) {
      throw new AppError('VALIDATION_ERROR', 400, `react_user_ids is not applicable to ${channelType} channels`);
    }
    // «Реакции всем» — список людей не нужен. Неизвестных и выбывших молча отбрасываем:
    // клиент присылает сохранённый список целиком, а убрать из него невидимого человека не может.
    const requested = out.react === null ? [] : [...new Set(input.reactUsers)];
    const found =
      requested.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: requested }, isActive: true, kickedAt: null },
            select: { id: true },
          })
        : [];
    const active = new Set(found.map((user) => user.id));
    out.reactUsers = requested.filter((id) => active.has(id));
  } else if (out.react === null) {
    out.reactUsers = [];
  }
  return out;
}

async function writeRules(tx: Prisma.TransactionClient, channelId: number, rules: ChannelRulesInput): Promise<void> {
  if (rules.view !== undefined) {
    await tx.channelRoleRule.deleteMany({ where: { channelId, action: 'VIEW' } });
    if (rules.view.length > 0) {
      await tx.channelRoleRule.createMany({
        data: rules.view.map((roleId) => ({ channelId, roleId, action: 'VIEW' as const })),
      });
    }
  }
  for (const key of RULE_KEYS) {
    const value = rules[key];
    if (value === undefined) continue;
    await tx.channel.update({ where: { id: channelId }, data: { [RULE_FLAG[key]]: value !== null } });
    await tx.channelRoleRule.deleteMany({ where: { channelId, action: RULE_ACTION[key] } });
    if (value && value.length > 0) {
      await tx.channelRoleRule.createMany({
        data: value.map((roleId) => ({ channelId, roleId, action: RULE_ACTION[key] })),
      });
    }
  }
  if (rules.reactUsers !== undefined) {
    await tx.channelUserRule.deleteMany({ where: { channelId, action: 'REACT' } });
    if (rules.reactUsers.length > 0) {
      await tx.channelUserRule.createMany({
        data: rules.reactUsers.map((userId) => ({ channelId, userId, action: 'REACT' as const })),
      });
    }
  }
}

function listWhereForUser(userId: number): Prisma.ChannelWhereInput {
  return { isDeleted: false, ...channelVisibleWhere(userId) };
}

async function nextChannelPosition(
  tx: Prisma.TransactionClient,
  channelType: ChannelType,
): Promise<number> {
  const agg = await tx.channel.aggregate({
    where: { channelType, isDeleted: false },
    _max: { position: true },
  });
  return (agg._max.position ?? -1) + 1;
}

/** У каждого канала — `my_permissions`: что текущему участнику можно в нём делать. */
export async function listChannels(userId: number) {
  const [rows, role] = await Promise.all([
    prisma.channel.findMany({
      where: listWhereForUser(userId),
      orderBy: channelListOrder,
      include: {
        roleRules: { select: channelRulesSelect.roleRules.select },
        userRules: { select: channelRulesSelect.userRules.select },
      },
    }),
    getRolePermissions(userId),
  ]);
  return rows.map((row) => ({
    ...toChannelDto(row),
    my_permissions: toChannelPermissionsDto(combinePermissions(role, channelRulesOf(row))),
  }));
}

export async function reorderChannels(
  actorId: number,
  channelType: ChannelType,
  channelIds: number[],
): Promise<void> {
  if (channelType !== 'TEXT' && channelType !== 'VOICE') {
    throw new AppError('VALIDATION_ERROR', 400, 'Invalid channel type');
  }
  const rows = await prisma.channel.findMany({
    where: { channelType, isDeleted: false },
    orderBy: channelListOrder,
    select: { id: true, ...channelAudienceSelect },
  });
  const nextIds = mergeVisibleChannelOrder(
    rows.map((row) => ({
      id: row.id,
      visible: privateAudienceOf(row)?.has(actorId) ?? true,
    })),
    channelIds,
  );
  if (!nextIds) {
    throw new AppError('VALIDATION_ERROR', 400, 'Invalid channel order');
  }
  await prisma.$transaction(
    nextIds.map((id, position) =>
      prisma.channel.update({
        where: { id },
        data: { position },
      }),
    ),
  );
}

export async function getChannelById(channelId: number, userId: number, includeMembers: boolean) {
  const row = await prisma.channel.findFirst({
    where: {
      id: channelId,
      isDeleted: false,
      ...channelVisibleWhere(userId),
    },
    include: {
      roleRules: { select: channelRulesSelect.roleRules.select },
      userRules: { select: channelRulesSelect.userRules.select },
    },
  });
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Channel not found');
  }
  const rules = channelRulesOf(row);
  const dto = {
    ...toChannelDto(row),
    my_permissions: toChannelPermissionsDto(combinePermissions(await getRolePermissions(userId), rules)),
  };
  if (!includeMembers) {
    return dto;
  }
  const members = await prisma.channelMember.findMany({
    where: { channelId },
    select: { userId: true },
    orderBy: { userId: 'asc' },
  });
  return {
    ...dto,
    member_user_ids: members.map((member) => member.userId),
    view_role_ids: row.roleRules.filter((rule) => rule.action === 'VIEW').map((rule) => rule.roleId),
    ...rulesDto(rules),
  };
}

async function privateMemberIds(actorId: number, requested: number[]): Promise<number[]> {
  const others = [...new Set(requested)].filter((id) => id !== actorId);
  if (others.length > 0) {
    const found = await prisma.user.findMany({
      where: { id: { in: others }, isActive: true, kickedAt: null },
      select: { id: true },
    });
    if (found.length !== others.length) {
      throw new AppError('VALIDATION_ERROR', 400, 'Unknown or inactive member');
    }
  }
  return [actorId, ...others];
}

export async function createChannel(
  createdById: number,
  name: string,
  channelType: ChannelType,
  isPrivate: boolean,
  memberUserIds: number[] | undefined,
  rulesInput?: ChannelRulesInput,
) {
  if (channelType === 'DM') {
    throw new AppError('VALIDATION_ERROR', 400, 'Use dedicated DM flow when available');
  }
  if (isPrivate && memberUserIds === undefined) {
    throw new AppError('VALIDATION_ERROR', 400, 'member_user_ids is required for a private channel');
  }
  if (!isPrivate && memberUserIds !== undefined) {
    throw new AppError('VALIDATION_ERROR', 400, 'member_user_ids is not allowed for a public channel');
  }
  const members = isPrivate ? await privateMemberIds(createdById, memberUserIds ?? []) : [];
  const rules = await normalizeRules(channelType, isPrivate, rulesInput);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.channel.create({
      data: {
        name: name.trim(),
        channelType,
        position: await nextChannelPosition(tx, channelType),
        isPrivate,
        createdById,
      },
    });
    if (members.length > 0) {
      await tx.channelMember.createMany({
        data: members.map((userId) => ({ channelId: created.id, userId })),
      });
    }
    await writeRules(tx, created.id, rules);
    return created;
  });
  return toChannelDto(row);
}

export async function updateChannel(
  channelId: number,
  actorId: number,
  patch: { name?: string; isPrivate?: boolean; memberUserIds?: number[]; rules?: ChannelRulesInput },
): Promise<ReturnType<typeof toChannelDto>> {
  if (
    patch.name === undefined &&
    patch.isPrivate === undefined &&
    patch.memberUserIds === undefined &&
    !hasRules(patch.rules)
  ) {
    throw new AppError('VALIDATION_ERROR', 400, 'Nothing to update');
  }
  if (patch.isPrivate === true && patch.memberUserIds === undefined) {
    throw new AppError('VALIDATION_ERROR', 400, 'member_user_ids is required when making a channel private');
  }
  if (patch.isPrivate === false && patch.memberUserIds !== undefined) {
    throw new AppError('VALIDATION_ERROR', 400, 'member_user_ids is not allowed for a public channel');
  }

  const existing = await prisma.channel.findFirst({
    where: {
      id: channelId,
      isDeleted: false,
      ...channelVisibleWhere(actorId),
    },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Channel not found');
  }
  // Старые названия длиннее лимита допустимы, пока канал не переименовывают.
  if (patch.name !== undefined && patch.name !== existing.name && patch.name.length > CHANNEL_NAME_MAX) {
    throw new AppError('VALIDATION_ERROR', 400, `name must be at most ${CHANNEL_NAME_MAX} characters`);
  }

  const nextPrivate = patch.isPrivate ?? existing.isPrivate;
  if (patch.memberUserIds !== undefined && !nextPrivate) {
    throw new AppError('VALIDATION_ERROR', 400, 'member_user_ids is not allowed for a public channel');
  }

  // Публичный канал не хранит роли видимости.
  const rules = await normalizeRules(
    existing.channelType,
    nextPrivate,
    patch.isPrivate === false ? { ...patch.rules, view: [] } : patch.rules,
  );

  let nextMemberIds: number[] | null = null;
  if (patch.isPrivate === false) {
    nextMemberIds = [];
  } else if (patch.memberUserIds !== undefined) {
    nextMemberIds = await privateMemberIds(actorId, patch.memberUserIds);
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.channel.update({
      where: { id: channelId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.isPrivate !== undefined ? { isPrivate: patch.isPrivate } : {}),
      },
    });
    if (nextMemberIds !== null) {
      await tx.channelMember.deleteMany({ where: { channelId } });
      if (nextMemberIds.length > 0) {
        await tx.channelMember.createMany({
          data: nextMemberIds.map((userId) => ({ channelId, userId })),
        });
      }
    }
    await writeRules(tx, channelId, rules);
    return updated;
  });

  if (hasRules(rules)) {
    invalidateChannelRules(channelId);
    // Тем, кто сейчас в этой голосовой комнате, пересчитать «говорить»/«транслировать».
    publishRealtimeEvent('internal:role_permissions_changed', { channel_id: channelId });
  }

  // Аудитория — люди и обладатели ролей видимости; кто выпал — уходит из голоса и чата канала.
  const audienceRow = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, select: channelAudienceSelect });
  const audience = privateAudienceOf(audienceRow);
  if (existing.channelType === 'VOICE' && audience !== null) {
    evictVoiceUsersExcept(channelId, audience);
  }

  publishRealtimeEvent('internal:channel_access_changed', {
    channel_id: channelId,
    deleted: false,
    is_private: row.isPrivate,
    member_user_ids: audience === null ? null : [...audience],
  });

  return toChannelDto(row);
}

export async function softDeleteChannel(channelId: number, actorId: number): Promise<void> {
  const existing = await prisma.channel.findFirst({
    where: {
      id: channelId,
      isDeleted: false,
      ...channelVisibleWhere(actorId),
    },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 404, 'Channel not found');
  }
  await prisma.$transaction([
    prisma.channel.update({
      where: { id: channelId },
      data: { isDeleted: true, deletedAt: new Date() },
    }),
    prisma.moderationLog.create({
      data: {
        actorId,
        action: 'CHANNEL_DELETE',
        reason: existing.name,
        channelId,
      },
    }),
  ]);
  if (existing.channelType === 'VOICE') {
    evictVoiceUsersExcept(channelId, new Set());
  }
  closeVoiceRouter(channelId);
  invalidateChannelRules(channelId);
  publishRealtimeEvent('internal:channel_access_changed', {
    channel_id: channelId,
    deleted: true,
  });
}

export async function leaveChannel(channelId: number, userId: number): Promise<void> {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, isDeleted: false },
    select: { isPrivate: true },
  });
  if (!channel) {
    throw new AppError('NOT_FOUND', 404, 'Channel not found');
  }
  if (channel.isPrivate) {
    const membership = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { id: true },
    });
    if (!membership) {
      throw new AppError('NOT_FOUND', 404, 'Membership not found');
    }
    throw new AppError('FORBIDDEN', 403, 'Private channel membership is managed by staff');
  }
  const res = await prisma.channelMember.deleteMany({
    where: { channelId, userId },
  });
  if (res.count === 0) {
    throw new AppError('NOT_FOUND', 404, 'Membership not found');
  }
}

import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { hasStaffKey, systemRoleKeysOf, userSystemRoleKeys } from '../../core/auth/roles.js';
import {
  invalidateRolePermissions,
  toPermissionsDto,
  type PermissionsDto,
} from '../../core/permissions/permissions.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { loadAvatarCatalog } from '../avatars/avatar-catalog.js';
import { publishShowcase, publishShowcaseForUsers } from '../badges/badges.service.js';
import { CUSTOM_ROLES_MAX } from './roles.schemas.js';

export type RoleDto = {
  id: number;
  key: string | null;
  name: string;
  color: string | null;
  position: number;
  is_system: boolean;
  /** Участники с ролью — отдельной группой в списке «Онлайн». */
  hoist: boolean;
  /** Значок роли (id из каталога); есть у всех носителей роли. */
  badge_id: string | null;
  /** Что роль разрешает. У OWNER/ADMIN всё true: они обходят запреты. */
  permissions: PermissionsDto;
};

export type RoleAssignmentDto = { user_id: number; roles: string[]; role_ids: number[] };

/** Системные роли, которые владелец выдаёт/снимает вручную. OWNER не выдаётся, MEMBER не снимается. */
const ASSIGNABLE_SYSTEM: ReadonlySet<string> = new Set(['ADMIN', 'MEMBER']);
const REMOVABLE_SYSTEM: ReadonlySet<string> = new Set(['ADMIN']);

function toRoleDto(row: Role): RoleDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    color: row.color,
    position: row.position,
    is_system: row.isSystem,
    hoist: row.hoist,
    badge_id: row.badgeId,
    permissions: toPermissionsDto({
      sendMessages: !row.denySendMessages,
      speak: !row.denySpeak,
      screenShare: !row.denyScreenShare,
      attachFiles: !row.denyAttachFiles,
    }),
  };
}

/** Порядок показа (он же приоритет): все роли по position, MEMBER (базовая) — всегда последней. */
function displayRank(row: Role): number {
  if (row.key === 'MEMBER') return Number.MAX_SAFE_INTEGER;
  return row.position;
}

/** Роли в общем порядке — все, кроме MEMBER. */
const ORDERED_ROLES_WHERE: Prisma.RoleWhereInput = { OR: [{ key: null }, { key: { not: 'MEMBER' } }] };

function sortForDisplay(rows: Role[]): Role[] {
  return [...rows].sort((a, b) => displayRank(a) - displayRank(b) || a.id - b.id);
}

async function assertOwner(actorId: number): Promise<void> {
  if (!(await userSystemRoleKeys(actorId)).has('OWNER')) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Only the owner can change roles');
  }
}

/** Поле `roles` — ключи системных ролей (контракт не зависит от имён), `role_ids` — все роли. */
async function assignmentOf(userId: number): Promise<RoleAssignmentDto> {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true, role: { select: { key: true } } },
    orderBy: { roleId: 'asc' },
  });
  return { user_id: userId, roles: systemRoleKeysOf(rows), role_ids: rows.map((row) => row.roleId) };
}

async function loadRole(roleId: number): Promise<Role> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    throw new AppError('NOT_FOUND', 404, 'Role not found');
  }
  return role;
}

/**
 * Системные роли самому себе не меняются, и владельцу — тоже (это делает только смена владельца).
 * Кастомные роли владелец может выдать кому угодно, в т.ч. себе.
 */
async function loadTarget(actorId: number, targetId: number, role: Role): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive || target.kickedAt) {
    throw new AppError('NOT_FOUND', 404, 'User not found');
  }
  if (role.key === null) {
    return;
  }
  if (actorId === targetId) {
    throw new AppError('VALIDATION_ERROR', 400, 'Cannot change your own roles');
  }
  if ((await userSystemRoleKeys(targetId)).has('OWNER')) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Owner role cannot be changed here');
  }
}

async function assertNameFree(name: string, exceptId: number | null): Promise<void> {
  const clash = await prisma.role.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId !== null ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new AppError('ROLE_NAME_TAKEN', 409, 'A role with this name already exists');
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function publishCatalogChanged(reason: 'created' | 'updated' | 'deleted' | 'reordered', roleId?: number): void {
  publishRealtimeEvent('roles:changed', { reason, ...(roleId !== undefined ? { role_id: roleId } : {}) });
}

/** Права поменялись: сбросить кэш и пересчитать голос (заглушка, трансляция). Без user_id — у всех. */
function rolePermissionsChanged(userId?: number): void {
  invalidateRolePermissions(userId);
  publishRealtimeEvent('internal:role_permissions_changed', userId !== undefined ? { user_id: userId } : {});
}

async function logRoleChange(actorId: number, targetUserId: number | null, reason: string): Promise<void> {
  await prisma.moderationLog.create({
    data: { actorId, targetUserId, action: 'ROLE_CHANGE', reason },
  });
}

export async function listRoles(): Promise<RoleDto[]> {
  const rows = await prisma.role.findMany();
  return sortForDisplay(rows).map(toRoleDto);
}

export async function createRole(
  actorId: number,
  input: { name: string; color: string | null },
): Promise<RoleDto> {
  await assertOwner(actorId);
  const customCount = await prisma.role.count({ where: { key: null } });
  if (customCount >= CUSTOM_ROLES_MAX) {
    throw new AppError('ROLE_LIMIT', 400, `No more than ${CUSTOM_ROLES_MAX} custom roles`);
  }
  await assertNameFree(input.name, null);
  const last = await prisma.role.aggregate({ where: ORDERED_ROLES_WHERE, _max: { position: true } });
  let row: Role;
  try {
    row = await prisma.role.create({
      data: {
        name: input.name,
        color: input.color,
        position: (last._max.position ?? -1) + 1,
        isSystem: false,
      },
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new AppError('ROLE_NAME_TAKEN', 409, 'A role with this name already exists');
    }
    throw error;
  }
  await logRoleChange(actorId, null, `create ${row.name}`);
  publishCatalogChanged('created', row.id);
  return toRoleDto(row);
}

export async function updateRole(
  actorId: number,
  roleId: number,
  patch: {
    name?: string;
    color?: string | null;
    permissions?: { send_messages?: boolean; speak?: boolean; screen_share?: boolean; attach_files?: boolean };
    hoist?: boolean;
    badge_id?: string | null;
  },
): Promise<RoleDto> {
  await assertOwner(actorId);
  const role = await loadRole(roleId);
  if (patch.badge_id) {
    const badge = (await loadAvatarCatalog()).badges.find((item) => item.id === patch.badge_id);
    if (badge?.category !== 'role') {
      throw new AppError('VALIDATION_ERROR', 400, 'badge_id: unknown role badge');
    }
  }
  const perms = patch.permissions;
  if (perms && hasStaffKey([role.key ?? ''])) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Owner and admin roles bypass permissions');
  }
  if (patch.hoist && role.key === 'MEMBER') {
    throw new AppError('VALIDATION_ERROR', 400, 'The base role cannot be shown separately');
  }
  if (patch.name !== undefined && patch.name !== role.name) {
    await assertNameFree(patch.name, role.id);
  }
  let row: Role;
  try {
    row = await prisma.role.update({
      where: { id: role.id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.hoist !== undefined ? { hoist: patch.hoist } : {}),
        ...(patch.badge_id !== undefined ? { badgeId: patch.badge_id } : {}),
        ...(perms?.send_messages !== undefined ? { denySendMessages: !perms.send_messages } : {}),
        ...(perms?.speak !== undefined ? { denySpeak: !perms.speak } : {}),
        ...(perms?.screen_share !== undefined ? { denyScreenShare: !perms.screen_share } : {}),
        ...(perms?.attach_files !== undefined ? { denyAttachFiles: !perms.attach_files } : {}),
      },
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new AppError('ROLE_NAME_TAKEN', 409, 'A role with this name already exists');
    }
    throw error;
  }
  if (row.name !== role.name) {
    await logRoleChange(actorId, null, `rename ${role.name} → ${row.name}`);
  }
  const permsChanged =
    row.denySendMessages !== role.denySendMessages ||
    row.denySpeak !== role.denySpeak ||
    row.denyScreenShare !== role.denyScreenShare ||
    row.denyAttachFiles !== role.denyAttachFiles;
  if (permsChanged) {
    await logRoleChange(actorId, null, `permissions ${row.name}`);
    rolePermissionsChanged();
  }
  if (row.hoist !== role.hoist) {
    await logRoleChange(actorId, null, `hoist ${row.name} ${row.hoist ? 'on' : 'off'}`);
  }
  if (row.badgeId !== role.badgeId) {
    await logRoleChange(actorId, null, `badge ${row.name} ${row.badgeId ?? 'none'}`);
    await publishShowcaseForUsers(await roleHolderIds(row.id));
  }
  publishCatalogChanged('updated', row.id);
  return toRoleDto(row);
}

async function roleHolderIds(roleId: number): Promise<number[]> {
  const rows = await prisma.userRole.findMany({ where: { roleId }, select: { userId: true } });
  return rows.map((row) => row.userId);
}

export async function deleteRole(actorId: number, roleId: number): Promise<void> {
  await assertOwner(actorId);
  const role = await loadRole(roleId);
  if (role.key !== null) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'System roles cannot be deleted');
  }
  const holders = role.badgeId ? await roleHolderIds(role.id) : [];
  // UserRole удаляются каскадом.
  await prisma.role.delete({ where: { id: role.id } });
  await logRoleChange(actorId, null, `delete ${role.name}`);
  rolePermissionsChanged();
  publishCatalogChanged('deleted', role.id);
  await publishShowcaseForUsers(holders);
}

/** `role_ids` — все роли, кроме MEMBER (она всегда снизу), в новом порядке сверху вниз. */
export async function reorderRoles(actorId: number, roleIds: number[]): Promise<RoleDto[]> {
  await assertOwner(actorId);
  const ordered = await prisma.role.findMany({ where: ORDERED_ROLES_WHERE, select: { id: true } });
  const known = new Set(ordered.map((row) => row.id));
  if (roleIds.length !== known.size || roleIds.some((id) => !known.has(id))) {
    throw new AppError('VALIDATION_ERROR', 400, 'role_ids must list every role except the base one exactly once');
  }
  await prisma.$transaction(
    roleIds.map((id, index) => prisma.role.update({ where: { id }, data: { position: index } })),
  );
  publishCatalogChanged('reordered');
  return listRoles();
}

export async function assignRole(actorId: number, roleId: number, targetId: number): Promise<RoleAssignmentDto> {
  await assertOwner(actorId);
  const role = await loadRole(roleId);
  if (role.key !== null && !ASSIGNABLE_SYSTEM.has(role.key)) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'This role cannot be assigned');
  }
  await loadTarget(actorId, targetId, role);
  const existing = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: targetId, roleId: role.id } },
  });
  if (!existing) {
    await prisma.userRole.create({ data: { userId: targetId, roleId: role.id } });
    await logRoleChange(actorId, targetId, `assign ${role.key ?? role.name}`);
  }
  rolePermissionsChanged(targetId);
  const payload = await assignmentOf(targetId);
  publishRealtimeEvent('role:update', payload);
  // Значок роли сам на витрину не встаёт, но вернувшаяся роль возвращает ранее закреплённый.
  if (role.badgeId) {
    await publishShowcase(targetId);
  }
  return payload;
}

export async function removeRole(actorId: number, roleId: number, targetId: number): Promise<RoleAssignmentDto> {
  await assertOwner(actorId);
  const role = await loadRole(roleId);
  if (role.key !== null && !REMOVABLE_SYSTEM.has(role.key)) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'This role cannot be removed');
  }
  await loadTarget(actorId, targetId, role);
  const existing = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: targetId, roleId: role.id } },
  });
  if (!existing) {
    throw new AppError('VALIDATION_ERROR', 400, 'User does not have this role');
  }
  await prisma.userRole.delete({ where: { id: existing.id } });
  await logRoleChange(actorId, targetId, `remove ${role.key ?? role.name}`);
  rolePermissionsChanged(targetId);
  const payload = await assignmentOf(targetId);
  publishRealtimeEvent('role:update', payload);
  if (role.badgeId) {
    await publishShowcase(targetId);
  }
  return payload;
}

import type { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

/**
 * Системные роли опознаются по неизменному `Role.key`, а не по `Role.name`:
 * имя — отображаемое и может редактироваться (MEMBER по умолчанию «Нормис»).
 */
export const SYSTEM_ROLE_KEYS = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

/** Имена системных ролей при первом создании (seed). Существующие имена seed не трогает. */
export const SYSTEM_ROLE_DEFAULT_NAMES: Record<SystemRoleKey, string> = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'Нормис',
};

const STAFF_KEYS: ReadonlySet<string> = new Set<SystemRoleKey>(['OWNER', 'ADMIN']);

export function isSystemRoleKey(value: string | null | undefined): value is SystemRoleKey {
  return value !== null && value !== undefined && (SYSTEM_ROLE_KEYS as readonly string[]).includes(value);
}

/** Ключи системных ролей из связей UserRole (порядок — по SYSTEM_ROLE_KEYS). Это поле `roles` в DTO. */
export function systemRoleKeysOf(rows: readonly { role: { key: string | null } }[]): SystemRoleKey[] {
  const keys = new Set(rows.map((row) => row.role.key));
  return SYSTEM_ROLE_KEYS.filter((key) => keys.has(key));
}

export async function userSystemRoleKeys(
  userId: number,
  db: Prisma.TransactionClient = prisma,
): Promise<Set<SystemRoleKey>> {
  const rows = await db.userRole.findMany({
    where: { userId },
    select: { role: { select: { key: true } } },
  });
  return new Set(systemRoleKeysOf(rows));
}

export function hasStaffKey(keys: Iterable<string>): boolean {
  for (const key of keys) {
    if (STAFF_KEYS.has(key)) return true;
  }
  return false;
}

export async function findSystemRole(key: SystemRoleKey, db: Prisma.TransactionClient = prisma) {
  return db.role.findUnique({ where: { key } });
}

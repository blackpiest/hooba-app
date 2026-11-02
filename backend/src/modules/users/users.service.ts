import { prisma } from '../../core/database/prisma.js';
import { systemRoleKeysOf } from '../../core/auth/roles.js';
import { applyPresencePreference, publicGameOf, publicStatusOf } from '../../core/presence/presence-registry.js';
import {
  presenceToDb,
  type PresencePreference,
  type PublicPresenceStatus,
} from '../../core/presence/resolve-public-status.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { AppError } from '../../core/errors/app-error.js';
import { findUserByUsername } from '../../core/auth/username.js';
import { normalizeDisplayName } from './display-name.js';
import { hasBannedWords } from '../word-filter/word-filter.service.js';
import {
  isValidAvatar,
  loadAvatarCatalog,
  normalizeUserAvatar,
  toUserAvatar,
  type UserAvatar,
} from '../avatars/avatar-catalog.js';
import { canUseCosmetic, loadCosmeticAccess } from '../cosmetics/cosmetic-access.js';
import { SHOWCASE_INCLUDE, showcaseOf } from '../badges/badges.service.js';

export async function listUsersForDirectory() {
  const [rows, catalog] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, kickedAt: null },
      orderBy: { username: 'asc' },
      include: SHOWCASE_INCLUDE,
    }),
    loadAvatarCatalog(),
  ]);
  return rows.map((u) => {
    const status = publicStatusOf(u.id);
    const showcase = showcaseOf(u, catalog);
    return {
      id: u.id,
      username: u.username,
      display_name: u.displayName,
      display_name_locked: u.displayNameLocked,
      roles: systemRoleKeysOf(u.roles),
      role_ids: u.roles.map((r) => r.roleId),
      status,
      is_online: status !== 'offline',
      last_seen_at: u.lastSeen?.toISOString() ?? null,
      game: publicGameOf(u.id),
      avatar: toUserAvatar(u),
      badges: showcase.badges,
      title: showcase.title,
    };
  });
}

export async function setMyPresence(
  userId: number,
  preference: PresencePreference,
): Promise<{ presence: PresencePreference; status: PublicPresenceStatus }> {
  const gameBefore = publicGameOf(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { presencePreference: presenceToDb(preference) },
  });
  const result = applyPresencePreference(userId, preference);
  const gameAfter = publicGameOf(userId);
  publishRealtimeEvent('internal:presence_preference', {
    user_id: userId,
    preference,
    status: result.next,
    broadcast_status: result.previous !== result.next,
    game: gameAfter,
    broadcast_game: gameBefore !== gameAfter,
  });
  return { presence: preference, status: result.next };
}

/** null — сбросить косметику (буквенный аватар, базовая рамка). Остальные клиенты узнают через `user:updated`. */
export async function setMyAvatar(
  userId: number,
  input: UserAvatar | null,
): Promise<{ avatar: UserAvatar | null }> {
  const avatar = normalizeUserAvatar(input);
  if (avatar) {
    const catalog = await loadAvatarCatalog();
    if (!isValidAvatar(catalog, avatar)) {
      throw new AppError('VALIDATION_ERROR', 400, 'avatar: unknown character, background or frame');
    }
    // Рамка, фон или персонаж — награда испытания: носит только заработавший (или получивший вручную).
    const access = await loadCosmeticAccess(userId);
    const picked = [
      ['frame', avatar.frame],
      ['background', avatar.background],
      ['character', avatar.character],
    ] as const;
    for (const [kind, id] of picked) {
      if (id !== null && !canUseCosmetic(access, kind, id)) {
        throw new AppError('COSMETIC_LOCKED', 403, `avatar: ${kind} is locked`);
      }
    }
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      avatarCharacter: avatar?.character ?? null,
      avatarBackground: avatar?.background ?? null,
      avatarFrame: avatar?.frame ?? null,
    },
  });
  publishRealtimeEvent('user:updated', { user_id: userId, avatar });
  return { avatar };
}

/**
 * Снять или заменить один слой косметики без проверок доступа (отзыв предмета владельцем).
 * Остальным клиентам уходит `user:updated` с новым аватаром целиком.
 */
export async function setAvatarField(
  userId: number,
  kind: 'frame' | 'background' | 'character',
  value: string | null,
): Promise<void> {
  const field = { frame: 'avatarFrame', background: 'avatarBackground', character: 'avatarCharacter' } as const;
  const row = await prisma.user.update({ where: { id: userId }, data: { [field[kind]]: value } });
  publishRealtimeEvent('user:updated', { user_id: userId, avatar: toUserAvatar(row) });
}

/** null/пустая строка — сбросить на username. Остальные клиенты узнают через `user:updated`. */
export async function setMyDisplayName(
  userId: number,
  raw: string | null,
): Promise<{ display_name: string | null }> {
  const parsed = normalizeDisplayName(raw);
  if (!parsed.ok) {
    throw new AppError('VALIDATION_ERROR', 400, `display_name: ${parsed.error}`);
  }
  // Имя не маскируем, как сообщение, а отклоняем — `*****` вместо ника хуже отказа.
  if (parsed.value !== null && (await hasBannedWords(parsed.value))) {
    throw new AppError('DISPLAY_NAME_FORBIDDEN', 400, 'display_name: contains banned word');
  }
  // Чужой логин (без учёта регистра) в имени — выдача себя за другого участника. Свой — можно.
  if (parsed.value !== null) {
    const holder = await findUserByUsername(prisma, parsed.value);
    if (holder && holder.id !== userId) {
      throw new AppError('DISPLAY_NAME_TAKEN', 400, 'display_name: matches another username');
    }
  }
  // Запрет staff (`displayNameLocked`) проверяем в самом update — не проскочит между чтением и записью.
  const { count } = await prisma.user.updateMany({
    where: parsed.value === null ? { id: userId } : { id: userId, displayNameLocked: false },
    data: { displayName: parsed.value },
  });
  if (count === 0) {
    throw new AppError('DISPLAY_NAME_LOCKED', 403, 'display_name: hidden by moderation');
  }
  publishRealtimeEvent('user:updated', { user_id: userId, display_name: parsed.value });
  return { display_name: parsed.value };
}

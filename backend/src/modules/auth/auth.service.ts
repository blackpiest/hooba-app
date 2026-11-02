import { randomBytes } from 'node:crypto';
import { prisma } from '../../core/database/prisma.js';
import {
  consumeInvite,
  ensurePersonalInvites,
  inviteRejection,
  isUserInvitesEnabled,
} from '../invites/invites.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { hashPassword, verifyPassword } from '../../core/auth/password.js';
import { accountDisabledError } from '../../core/auth/member-session.js';
import { findUserByUsername } from '../../core/auth/username.js';
import { signAccessToken } from '../../core/auth/tokens.js';
import { findSystemRole, systemRoleKeysOf } from '../../core/auth/roles.js';
import { getRolePermissions, toPermissionsDto, type PermissionsDto } from '../../core/permissions/permissions.js';
import type { Env } from '../../config/env.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { hasBannedWords } from '../word-filter/word-filter.service.js';
import { presenceFromDb } from '../../core/presence/resolve-public-status.js';
import {
  createRefreshSession,
  findActiveSessionByRefreshRaw,
  generateRefreshRawAndHash,
  revokeAllRefreshSessionsForUser,
  revokeRefreshSessionById,
  rotateRefreshSession,
} from '../../core/auth/refresh-session.js';
import { loadAvatarCatalog, toUserAvatar, type UserAvatar } from '../avatars/avatar-catalog.js';
import { SHOWCASE_INCLUDE, showcaseOf } from '../badges/badges.service.js';
import { evaluateChallenges } from '../challenges/challenge-evaluator.js';
import { serverIconUrl } from '../server-icon/server-icon-storage.js';

const RESERVED = new Set(['admin', 'system']);

/** Фиктивный хеш с теми же параметрами argon2: время ответа не выдаёт, есть ли такой ник. */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002'
  );
}

async function assertBootstrapped(): Promise<void> {
  const s = await prisma.serverSettings.findUnique({ where: { id: 1 } });
  if (!s?.isBootstrapped) {
    throw new AppError('BOOTSTRAP_REQUIRED', 403, 'Complete server setup before auth');
  }
}

export type TokenBundle = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
};

async function issueTokenBundle(env: Env, userId: number, username: string): Promise<TokenBundle> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!row) {
    throw new AppError('UNAUTHORIZED', 401, 'User not found');
  }
  const { raw, tokenHash } = generateRefreshRawAndHash();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000);
  const sessionId = await createRefreshSession(userId, tokenHash, expiresAt);
  const access_token = await signAccessToken(env, {
    userId,
    username,
    sessionVersion: row.sessionVersion,
    sessionId,
  });
  return {
    access_token,
    refresh_token: raw,
    expires_in: env.ACCESS_TOKEN_EXPIRES_SEC,
    token_type: 'Bearer',
  };
}

export async function login(
  env: Env,
  input: { username: string; password: string },
): Promise<TokenBundle> {
  await assertBootstrapped();
  const username = input.username.trim();
  const user = await findUserByUsername(prisma, username);
  if (!user) {
    await verifyPassword(await getDummyHash(), input.password);
    throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid username or password');
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid username or password');
  }
  if (!user.isActive) {
    throw await accountDisabledError(user.id);
  }
  if (user.kickedAt) {
    throw new AppError('KICKED', 403, 'Removed from the community. Rejoin with a new invite.');
  }
  return issueTokenBundle(env, user.id, user.username);
}

export async function register(
  env: Env,
  input: { invite_code: string; username: string; password: string },
): Promise<TokenBundle> {
  await assertBootstrapped();
  const username = input.username.trim();
  if (RESERVED.has(username.toLowerCase())) {
    throw new AppError('VALIDATION_ERROR', 400, 'Username is reserved');
  }
  // Логин потом не сменить — проверяем до инвайта и хеша пароля.
  if (await hasBannedWords(username)) {
    throw new AppError('USERNAME_FORBIDDEN', 400, 'Username contains banned word');
  }

  const code = input.invite_code.trim();
  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({
        where: { code },
        include: { createdBy: { select: { username: true, isActive: true, kickedAt: true } } },
      });
      if (!invite) {
        throw new AppError('INVITE_INVALID', 400, 'Invalid invite code');
      }
      const rejection = inviteRejection(invite, await isUserInvitesEnabled(tx));
      if (rejection) {
        throw new AppError(rejection.code, 400, rejection.message);
      }

      const memberRole = await findSystemRole('MEMBER', tx);
      if (!memberRole) {
        throw new AppError('SERVER_MISCONFIGURED', 500, 'MEMBER role missing; run prisma db seed');
      }

      const taken = await findUserByUsername(tx, username);
      if (taken) {
        if (!taken.isActive) {
          throw new AppError('ACCOUNT_DISABLED', 403, 'Account is disabled');
        }
        if (taken.kickedAt) {
          const passwordOk = await verifyPassword(taken.passwordHash, input.password);
          if (!passwordOk) {
            throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid username or password');
          }
          await tx.user.update({
            where: { id: taken.id },
            data: { kickedAt: null },
          });
          const memberLink = await tx.userRole.findUnique({
            where: { userId_roleId: { userId: taken.id, roleId: memberRole.id } },
          });
          if (!memberLink) {
            await tx.userRole.create({
              data: { userId: taken.id, roleId: memberRole.id },
            });
          }
          await consumeInvite(
            tx,
            { id: invite.id, createdById: invite.createdById, createdByUsername: invite.createdBy.username },
            taken.id,
          );
          return taken;
        }
        throw new AppError('USERNAME_ALREADY_EXISTS', 409, 'Username is already taken');
      }

      const created = await tx.user.create({
        data: { username, passwordHash, isActive: true, invitedById: invite.createdById },
      });
      await ensurePersonalInvites(tx, created.id);

      await tx.userRole.create({
        data: { userId: created.id, roleId: memberRole.id },
      });

      await consumeInvite(
        tx,
        { id: invite.id, createdById: invite.createdById, createdByUsername: invite.createdBy.username },
        created.id,
      );

      return created;
    });
  } catch (e: unknown) {
    if (e instanceof AppError) {
      throw e;
    }
    if (isPrismaUniqueViolation(e)) {
      throw new AppError('USERNAME_ALREADY_EXISTS', 409, 'Username is already taken');
    }
    throw e;
  }

  publishRealtimeEvent('member:joined', { user_id: user.id, username: user.username });
  // Испытания «пригласи N участников» засчитываются сразу, не дожидаясь таймера оценщика.
  if (user.invitedById !== null) {
    await evaluateChallenges([user.invitedById]).catch((error: unknown) => {
      console.error('[challenges] inviter', error);
    });
  }

  return issueTokenBundle(env, user.id, user.username);
}

export async function refreshAccess(env: Env, refresh_token: string): Promise<TokenBundle> {
  await assertBootstrapped();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000);
  const rotated = await rotateRefreshSession(refresh_token, expiresAt);
  if (rotated.kind === 'reuse') {
    const live = await prisma.refreshSession.findMany({
      where: { userId: rotated.userId, revokedAt: null },
      select: { id: true },
    });
    await revokeAllRefreshSessionsForUser(rotated.userId);
    for (const row of live) {
      publishRealtimeEvent('internal:session_revoked', {
        user_id: rotated.userId,
        session_id: row.id,
      });
    }
    throw new AppError('REFRESH_INVALID', 401, 'Invalid or expired refresh token');
  }
  if (rotated.kind !== 'rotated') {
    throw new AppError('REFRESH_INVALID', 401, 'Invalid or expired refresh token');
  }
  const session = rotated.session;
  if (!session.isActive) {
    await revokeRefreshSessionById(session.sessionId, 'FORCED');
    throw await accountDisabledError(session.userId);
  }
  if (session.kickedAt) {
    await revokeRefreshSessionById(session.sessionId, 'FORCED');
    throw new AppError('KICKED', 403, 'Removed from the community. Rejoin with a new invite.');
  }
  const access_token = await signAccessToken(env, {
    userId: session.userId,
    username: session.username,
    sessionVersion: session.sessionVersion,
    sessionId: session.sessionId,
  });
  return {
    access_token,
    refresh_token: session.refreshRaw,
    expires_in: env.ACCESS_TOKEN_EXPIRES_SEC,
    token_type: 'Bearer',
  };
}

export async function logout(refresh_token: string): Promise<{ ok: true }> {
  const session = await findActiveSessionByRefreshRaw(refresh_token);
  if (!session) {
    throw new AppError('REFRESH_INVALID', 401, 'Invalid or expired refresh token');
  }
  await revokeRefreshSessionById(session.id, 'LOGOUT');
  publishRealtimeEvent('internal:session_revoked', {
    user_id: session.userId,
    session_id: session.id,
  });
  return { ok: true };
}

export async function getMe(
  userId: number,
): Promise<{
  id: number;
  username: string;
  display_name: string | null;
  /** Staff скрыл имя: задать новое нельзя (`PATCH /me/profile` → 403). */
  display_name_locked: boolean;
  roles: string[];
  role_ids: number[];
  /** Права от ролей сервера (без учёта ограничений каналов). */
  permissions: PermissionsDto;
  server_name: string;
  /** Аватар сервера; null — нет. */
  server_icon_url: string | null;
  user_invites_enabled: boolean;
  presence: 'online' | 'idle' | 'dnd' | 'invisible';
  avatar: UserAvatar | null;
  /** Витрина: закреплённые значки и титул (как в `GET /users`). */
  badges: string[];
  title: string | null;
}> {
  const [user, settings, catalog] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: SHOWCASE_INCLUDE,
    }),
    prisma.serverSettings.findUnique({ where: { id: 1 } }),
    loadAvatarCatalog(),
  ]);
  if (!user) {
    throw new AppError('UNAUTHORIZED', 401, 'User not found');
  }
  if (!user.isActive) {
    throw await accountDisabledError(user.id);
  }
  if (user.kickedAt) {
    throw new AppError('KICKED', 403, 'Removed from the community. Rejoin with a new invite.');
  }
  if (!settings) {
    throw new AppError(
      'SERVER_MISCONFIGURED',
      500,
      'ServerSettings row missing; run pnpm prisma:seed',
    );
  }
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    display_name_locked: user.displayNameLocked,
    roles: systemRoleKeysOf(user.roles),
    role_ids: user.roles.map((ur) => ur.roleId),
    permissions: toPermissionsDto(await getRolePermissions(user.id)),
    server_name: settings.serverName,
    server_icon_url: serverIconUrl(settings.iconKey),
    user_invites_enabled: settings.userInvitesEnabled,
    presence: presenceFromDb(user.presencePreference),
    avatar: toUserAvatar(user),
    ...showcaseOf(user, catalog),
  };
}

import type { FastifyRequest } from 'fastify';
import { hasStaffKey, userSystemRoleKeys } from '../../core/auth/roles.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertCommunitySession } from '../../core/auth/member-session.js';
import { assertRefreshSessionActive } from '../../core/auth/refresh-session.js';
import { verifyAccessToken } from '../../core/auth/tokens.js';

export async function requireAuth(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing or invalid Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing access token');
  }
  try {
    const { userId, username, sessionVersion, sessionId } = await verifyAccessToken(
      request.server.appEnv,
      token,
    );
    await assertCommunitySession(userId, sessionVersion);
    await assertRefreshSessionActive(sessionId);
    request.auth = { userId, username };
  } catch (e: unknown) {
    if (e instanceof AppError) {
      throw e;
    }
    throw new AppError('UNAUTHORIZED', 401, 'Invalid or expired access token');
  }
}

export async function requireOwner(request: FastifyRequest): Promise<void> {
  await requireAuth(request);
  const userId = request.auth?.userId;
  if (userId === undefined) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
  }
  if (!(await userSystemRoleKeys(userId)).has('OWNER')) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Only the owner can change roles');
  }
}

export async function userIsStaff(userId: number): Promise<boolean> {
  return hasStaffKey(await userSystemRoleKeys(userId));
}

export async function requireStaff(request: FastifyRequest): Promise<void> {
  await requireAuth(request);
  const userId = request.auth?.userId;
  if (userId === undefined) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
  }
  if (!(await userIsStaff(userId))) {
    throw new AppError('FORBIDDEN', 403, 'Insufficient permissions');
  }
}

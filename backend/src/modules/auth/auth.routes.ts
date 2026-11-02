import type { FastifyInstance } from 'fastify';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import {
  clearRateLimit,
  consumeRateLimit,
  isRateLimited,
  recordRateLimitHit,
} from '../../core/http/rate-limit.js';
import {
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  registerBodySchema,
} from './auth.schemas.js';
import * as authService from './auth.service.js';
import { requireAuth } from './auth.middleware.js';

const AUTH_LIMIT = 5;
const AUTH_WINDOW_MS = 60_000;
const REFRESH_LIMIT = 20;
const LOGIN_FAIL_WINDOW_MS = 15 * 60_000;
const LOGIN_FAIL_PER_SOURCE_LIMIT = 5;
const LOGIN_FAIL_PER_USER_LIMIT = 30;

function assertAuthRateLimit(action: string, ip: string, limit = AUTH_LIMIT): void {
  if (!consumeRateLimit(`auth:${action}:${ip}`, limit, AUTH_WINDOW_MS)) {
    throw new AppError('RATE_LIMITED', 429, 'Too many requests');
  }
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/auth/login', async (request, reply) => {
    assertAuthRateLimit('login', request.ip);
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
      throw new AppError('VALIDATION_ERROR', 400, msg);
    }
    const userKey = parsed.data.username.trim().toLowerCase();
    const sourceFailKey = `auth:login-fail:${userKey}:${request.ip}`;
    const userFailKey = `auth:login-fail:${userKey}`;
    if (
      isRateLimited(sourceFailKey, LOGIN_FAIL_PER_SOURCE_LIMIT, LOGIN_FAIL_WINDOW_MS) ||
      isRateLimited(userFailKey, LOGIN_FAIL_PER_USER_LIMIT, LOGIN_FAIL_WINDOW_MS)
    ) {
      throw new AppError('RATE_LIMITED', 429, 'Too many requests');
    }
    let data;
    try {
      data = await authService.login(app.appEnv, parsed.data);
    } catch (e) {
      if (e instanceof AppError && e.code === 'INVALID_CREDENTIALS') {
        recordRateLimitHit(sourceFailKey, LOGIN_FAIL_WINDOW_MS);
        recordRateLimitHit(userFailKey, LOGIN_FAIL_WINDOW_MS);
      }
      throw e;
    }
    clearRateLimit(sourceFailKey);
    return reply.send(ok(data));
  });

  app.post('/api/v1/auth/register', async (request, reply) => {
    assertAuthRateLimit('register', request.ip);
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
      throw new AppError('VALIDATION_ERROR', 400, msg);
    }
    assertAuthRateLimit('register-user', parsed.data.username.trim().toLowerCase());
    const data = await authService.register(app.appEnv, parsed.data);
    return reply.send(ok(data));
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    assertAuthRateLimit('refresh', request.ip, REFRESH_LIMIT);
    const parsed = refreshBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
      throw new AppError('VALIDATION_ERROR', 400, msg);
    }
    const data = await authService.refreshAccess(app.appEnv, parsed.data.refresh_token);
    return reply.send(ok(data));
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const parsed = logoutBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
      throw new AppError('VALIDATION_ERROR', 400, msg);
    }
    const data = await authService.logout(parsed.data.refresh_token);
    return reply.send(ok(data));
  });

  app.get(
    '/api/v1/auth/me',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth?.userId;
      if (userId === undefined) {
        throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
      }
      const data = await authService.getMe(userId);
      return reply.send(ok(data));
    },
  );
}

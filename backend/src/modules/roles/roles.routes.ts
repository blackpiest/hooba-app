import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { parseIdParam } from '../../core/http/params.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { requireAuth, requireOwner } from '../auth/auth.middleware.js';
import {
  createRoleBodySchema,
  patchRoleBodySchema,
  reorderRolesBodySchema,
  roleUserBodySchema,
} from './roles.schemas.js';
import * as rolesService from './roles.service.js';

function actorIdOf(request: FastifyRequest): number {
  const actorId = request.auth?.userId;
  if (actorId === undefined) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
  }
  return actorId;
}

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
    throw new AppError('VALIDATION_ERROR', 400, msg);
  }
  return parsed.data;
}

function limitRoleEdits(actorId: number): void {
  if (!consumeRateLimit(`roles:edit:${actorId}`, 60, 60_000)) {
    throw new AppError('RATE_LIMITED', 429, 'Too many role changes, try again later');
  }
}

export async function registerRolesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/roles',
    { preHandler: requireAuth },
    async (_request, reply) => {
      const data = await rolesService.listRoles();
      return reply.send(ok(data));
    },
  );

  app.post(
    '/api/v1/roles',
    { preHandler: requireOwner },
    async (request, reply) => {
      const actorId = actorIdOf(request);
      const body = parseBody(createRoleBodySchema, request.body);
      limitRoleEdits(actorId);
      return reply.send(ok(await rolesService.createRole(actorId, body)));
    },
  );

  app.patch(
    '/api/v1/roles/order',
    { preHandler: requireOwner },
    async (request, reply) => {
      const actorId = actorIdOf(request);
      const body = parseBody(reorderRolesBodySchema, request.body);
      limitRoleEdits(actorId);
      return reply.send(ok(await rolesService.reorderRoles(actorId, body.role_ids)));
    },
  );

  app.patch(
    '/api/v1/roles/:id',
    { preHandler: requireOwner },
    async (request, reply) => {
      const actorId = actorIdOf(request);
      const roleId = parseIdParam(request.params, 'role');
      const body = parseBody(patchRoleBodySchema, request.body);
      limitRoleEdits(actorId);
      return reply.send(ok(await rolesService.updateRole(actorId, roleId, body)));
    },
  );

  app.delete(
    '/api/v1/roles/:id',
    { preHandler: requireOwner },
    async (request, reply) => {
      const actorId = actorIdOf(request);
      const roleId = parseIdParam(request.params, 'role');
      limitRoleEdits(actorId);
      await rolesService.deleteRole(actorId, roleId);
      return reply.send(ok({ id: roleId }));
    },
  );

  app.post(
    '/api/v1/roles/:id/assign',
    { preHandler: requireOwner },
    async (request, reply) => {
      const actorId = actorIdOf(request);
      const body = parseBody(roleUserBodySchema, request.body);
      const data = await rolesService.assignRole(actorId, parseIdParam(request.params, 'role'), body.user_id);
      return reply.send(ok(data));
    },
  );

  app.post(
    '/api/v1/roles/:id/remove',
    { preHandler: requireOwner },
    async (request, reply) => {
      const actorId = actorIdOf(request);
      const body = parseBody(roleUserBodySchema, request.body);
      const data = await rolesService.removeRole(actorId, parseIdParam(request.params, 'role'), body.user_id);
      return reply.send(ok(data));
    },
  );
}

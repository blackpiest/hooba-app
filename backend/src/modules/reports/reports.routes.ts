import type { FastifyInstance } from 'fastify';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { parseIdParam } from '../../core/http/params.js';
import { requireAuth, requireStaff } from '../auth/auth.middleware.js';
import { reportCreateBodySchema, reportsListQuerySchema } from './reports.schemas.js';
import * as reportsService from './reports.service.js';

function authedUserId(userId: number | undefined): number {
  if (userId === undefined) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing authentication');
  }
  return userId;
}

export async function registerReportsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/reports', { preHandler: requireAuth }, async (request, reply) => {
    const reporterId = authedUserId(request.auth?.userId);
    const parsed = reportCreateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
      throw new AppError('VALIDATION_ERROR', 400, msg);
    }
    if (!consumeRateLimit(`report-create:${reporterId}`, 5, 60_000)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many reports, try again later');
    }
    await reportsService.createReport(reporterId, parsed.data.user_id, parsed.data.reason);
    return reply.send(ok({ ok: true }));
  });

  app.get('/api/v1/reports/mine', { preHandler: requireAuth }, async (request, reply) => {
    const reporterId = authedUserId(request.auth?.userId);
    const targetUserIds = await reportsService.listMyOpenTargets(reporterId);
    return reply.send(ok({ target_user_ids: targetUserIds }));
  });

  app.get('/api/v1/reports', { preHandler: requireStaff }, async (request, reply) => {
    authedUserId(request.auth?.userId);
    const parsed = reportsListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${String(first.path[0] ?? 'query')}: ${first.message}` : 'Invalid query';
      throw new AppError('VALIDATION_ERROR', 400, msg);
    }
    const { status, offset, limit } = parsed.data;
    return reply.send(ok(await reportsService.listReports(status, offset, limit)));
  });

  app.get('/api/v1/reports/open-count', { preHandler: requireStaff }, async (request, reply) => {
    authedUserId(request.auth?.userId);
    return reply.send(ok({ count: await reportsService.countOpenReports() }));
  });

  app.post('/api/v1/reports/:id/resolve', { preHandler: requireStaff }, async (request, reply) => {
    const actorId = authedUserId(request.auth?.userId);
    const reportId = parseIdParam(request.params, 'report');
    await reportsService.resolveReport(actorId, reportId);
    return reply.send(ok({ ok: true }));
  });
}

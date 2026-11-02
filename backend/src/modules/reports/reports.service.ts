import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { systemRoleKeysOf, userSystemRoleKeys } from '../../core/auth/roles.js';
import { assertModerationAllowed } from '../moderation/moderation.service.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';

const reportInclude = {
  reporter: { select: { id: true, username: true, displayName: true } },
  target: {
    select: {
      id: true,
      username: true,
      displayName: true,
      roles: { select: { role: { select: { key: true } } } },
    },
  },
  resolvedBy: { select: { id: true, username: true, displayName: true } },
} satisfies Prisma.UserReportInclude;

type ReportRow = Prisma.UserReportGetPayload<{ include: typeof reportInclude }>;

function toDto(r: ReportRow) {
  return {
    id: r.id,
    reason: r.reason,
    created_at: r.createdAt.toISOString(),
    resolved_at: r.resolvedAt?.toISOString() ?? null,
    reporter: { id: r.reporter.id, username: r.reporter.username, display_name: r.reporter.displayName },
    target: {
      id: r.target.id,
      username: r.target.username,
      display_name: r.target.displayName,
      role_keys: systemRoleKeysOf(r.target.roles),
    },
    resolved_by: r.resolvedBy
      ? { id: r.resolvedBy.id, username: r.resolvedBy.username, display_name: r.resolvedBy.displayName }
      : null,
  };
}

export async function createReport(reporterId: number, targetId: number, reason: string): Promise<void> {
  if (reporterId === targetId) {
    throw new AppError('VALIDATION_ERROR', 400, 'Cannot report yourself');
  }
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive || target.kickedAt) {
    throw new AppError('NOT_FOUND', 404, 'User not found');
  }
  const targetRoles = await userSystemRoleKeys(targetId);
  if (targetRoles.has('OWNER')) {
    throw new AppError('FORBIDDEN', 403, 'Cannot report the server owner');
  }
  const open = await prisma.userReport.findFirst({
    where: { reporterId, targetUserId: targetId, resolvedAt: null },
    select: { id: true },
  });
  if (open) {
    throw new AppError('REPORT_ALREADY_EXISTS', 409, 'You already have an open report on this user');
  }
  try {
    await prisma.userReport.create({ data: { reporterId, targetUserId: targetId, reason } });
  } catch (err: unknown) {
    // Гонка двух запросов: сработал частичный уникальный индекс открытых жалоб.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('REPORT_ALREADY_EXISTS', 409, 'You already have an open report on this user');
    }
    throw err;
  }
  publishRealtimeEvent('internal:reports_changed', {});
}

export async function listMyOpenTargets(reporterId: number): Promise<number[]> {
  const rows = await prisma.userReport.findMany({
    where: { reporterId, resolvedAt: null },
    select: { targetUserId: true },
  });
  return rows.map((r) => r.targetUserId);
}

export async function listReports(status: 'open' | 'resolved', offset: number, limit: number) {
  const rows = await prisma.userReport.findMany({
    where: { resolvedAt: status === 'open' ? null : { not: null } },
    orderBy: status === 'open' ? { createdAt: 'desc' } : { resolvedAt: 'desc' },
    skip: offset,
    take: limit,
    include: reportInclude,
  });
  return rows.map(toDto);
}

export async function countOpenReports(): Promise<number> {
  return prisma.userReport.count({ where: { resolvedAt: null } });
}

export async function resolveReport(actorId: number, reportId: number): Promise<void> {
  const report = await prisma.userReport.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new AppError('NOT_FOUND', 404, 'Report not found');
  }
  // Жалобу на OWNER/ADMIN рассматривает только OWNER; на себя — никто.
  await assertModerationAllowed(actorId, report.targetUserId);
  if (report.resolvedAt) {
    return;
  }
  const { count } = await prisma.userReport.updateMany({
    where: { id: reportId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: actorId },
  });
  if (count === 0) {
    return;
  }
  publishRealtimeEvent('internal:reports_changed', {
    reporter_id: report.reporterId,
    target_user_id: report.targetUserId,
  });
}

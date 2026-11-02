import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { publishRealtimeEvent } from '../realtime/realtime-bus.js';
import { serverIconUrl } from '../server-icon/server-icon-storage.js';

export type ServerSettingsDto = {
  user_invites_enabled: boolean;
  timezone: string;
  /** Аватар сервера; null — нет (клиент рисует букву названия). */
  server_icon_url: string | null;
};

export async function getServerSettings(): Promise<ServerSettingsDto> {
  const row = await prisma.serverSettings.findUnique({
    where: { id: 1 },
    select: { userInvitesEnabled: true, timezone: true, iconKey: true },
  });
  if (!row) {
    throw new AppError('SERVER_MISCONFIGURED', 500, 'ServerSettings row missing; run pnpm prisma:seed');
  }
  return {
    user_invites_enabled: row.userInvitesEnabled,
    timezone: row.timezone,
    server_icon_url: serverIconUrl(row.iconKey),
  };
}

/** WS `server:settings` всем: полный снимок публичных настроек (клиент заменяет поля целиком). */
function publishSettings(settings: ServerSettingsDto): void {
  publishRealtimeEvent('internal:server_settings_changed', {
    user_invites_enabled: settings.user_invites_enabled,
    server_icon_url: settings.server_icon_url,
  });
}

export async function publishServerSettings(): Promise<void> {
  publishSettings(await getServerSettings());
}

/** Часовой пояс сообщества для подсчёта дней в испытаниях. Нет строки настроек — UTC. */
export async function getCommunityTimezone(): Promise<string> {
  const row = await prisma.serverSettings.findUnique({ where: { id: 1 }, select: { timezone: true } });
  return row?.timezone ?? 'UTC';
}

export async function setUserInvitesEnabled(enabled: boolean, actorId: number): Promise<ServerSettingsDto> {
  const current = await getServerSettings();
  if (current.user_invites_enabled === enabled) {
    return current;
  }
  await prisma.$transaction([
    prisma.serverSettings.update({ where: { id: 1 }, data: { userInvitesEnabled: enabled } }),
    prisma.moderationLog.create({
      data: { actorId, action: enabled ? 'USER_INVITES_ENABLE' : 'USER_INVITES_DISABLE' },
    }),
  ]);
  const next = { ...current, user_invites_enabled: enabled };
  publishSettings(next);
  return next;
}

/** Смена пояса не портит данные: копилки хранят UTC, дни пересчитываются при чтении. */
export async function setTimezone(timezone: string): Promise<ServerSettingsDto> {
  await prisma.serverSettings.update({ where: { id: 1 }, data: { timezone } });
  return getServerSettings();
}

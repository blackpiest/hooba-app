import type { FastifyInstance } from 'fastify';
import { userIsStaff } from '../auth/auth.middleware.js';
import { countOpenReports } from '../reports/reports.service.js';
import { onPresenceGraceExpired } from '../../core/presence/presence-registry.js';
import { loadChannelAudience } from '../../core/permissions/channel-visibility.js';
import {
  evictVoiceUsersExcept,
  kickVoiceUser,
  listVoiceUsers,
  subscribeVoiceRoomsSnapshotChanged,
} from '../voice/voice-registry.js';
import { clearVoiceChannelAccess, forgetVoiceChannelAccess } from '../voice/voice-channel-access.js';
import { subscribeRealtimeEvent } from './realtime-bus.js';
import {
  broadcastAll,
  channelSockets,
  dropChannelSubscribers,
  forEachAuthedUserSocket,
  liveChannelAudience,
  sendWs,
  socketMeta,
} from './ws-registry.js';
import { forceLogoutUser } from './ws-session.js';
import { writeLastSeen } from './handlers/presence.js';
import { broadcastVoiceRoomsSnapshot, forceLeaveVoiceForUser, resyncVoicePermissions } from './handlers/voice.js';

type BusData = Record<string, unknown>;
type BusHandler = (app: FastifyInstance, data: BusData) => void;

/** Счётчик открытых жалоб — только staff; жалобщику при рассмотрении — снятие блокировки повторной жалобы. */
async function broadcastReportsChanged(data: BusData) {
  const openCount = await countOpenReports();
  const staffByUser = new Map<number, boolean>();
  for (const [socket, meta] of [...socketMeta]) {
    if (meta.phase !== 'authed' || socket.readyState !== 1) continue;
    let staff = staffByUser.get(meta.userId);
    if (staff === undefined) {
      staff = await userIsStaff(meta.userId);
      staffByUser.set(meta.userId, staff);
    }
    if (staff) {
      sendWs(socket, 'report:count', { open_count: openCount });
    }
  }
  const reporterId = Number(data.reporter_id);
  const targetUserId = Number(data.target_user_id);
  if (Number.isFinite(reporterId) && Number.isFinite(targetUserId)) {
    forEachAuthedUserSocket(reporterId, (socket) => {
      sendWs(socket, 'report:resolved', { target_user_id: targetUserId });
    });
  }
}

/** Кто потерял доступ к приватному каналу — отписать от его чата и убрать из его голосовой комнаты. */
async function resyncChannelAudiences(): Promise<void> {
  for (const channelId of [...channelSockets.keys()]) {
    await liveChannelAudience(channelId);
  }
  const voiceChannelIds = new Set(listVoiceUsers().map((u) => u.channelId));
  for (const channelId of voiceChannelIds) {
    const audience = await loadChannelAudience(channelId);
    if (audience === undefined) {
      evictVoiceUsersExcept(channelId, new Set());
    } else if (audience !== null) {
      evictVoiceUsersExcept(channelId, audience);
    }
  }
}

function sendToUser(userId: number, event: string, data: unknown) {
  forEachAuthedUserSocket(userId, (socket) => {
    sendWs(socket, event, data);
  });
}

const busHandlers: Record<string, BusHandler> = {
  'internal:presence_preference': (_app, data) => {
    const userId = Number(data.user_id);
    const preference = data.preference;
    const status = data.status;
    if (!Number.isFinite(userId) || typeof preference !== 'string' || typeof status !== 'string') {
      return;
    }
    if (data.broadcast_status === true) {
      broadcastAll('presence:user_status', { user_id: userId, status });
    }
    if (data.broadcast_game === true) {
      const game = typeof data.game === 'string' || data.game === null ? data.game : null;
      broadcastAll('presence:activity', { user_id: userId, game });
    }
    sendToUser(userId, 'presence:preference', { status: preference });
  },

  'internal:role_permissions_changed': (app, data) => {
    // user_id — роли одного участника, channel_id — правила одного канала, ничего — всё сразу.
    const userId = Number(data.user_id);
    const channelId = Number(data.channel_id);
    const targets = listVoiceUsers().filter(
      (u) =>
        (!(Number.isFinite(userId) && userId > 0) || u.userId === userId) &&
        (!(Number.isFinite(channelId) && channelId > 0) || u.channelId === channelId),
    );
    // Роли участников поменялись — могла поменяться и аудитория приватных каналов с ролями видимости.
    if (!(Number.isFinite(channelId) && channelId > 0)) {
      clearVoiceChannelAccess();
      broadcastVoiceRoomsSnapshot(app);
      void resyncChannelAudiences().catch((err: unknown) => {
        app.log.error({ err }, 'channel audience resync');
      });
    }
    void resyncVoicePermissions(targets).catch((err: unknown) => {
      app.log.error({ err }, 'voice permissions resync');
    });
  },

  'internal:server_settings_changed': (_app, data) => {
    broadcastAll('server:settings', {
      user_invites_enabled: data.user_invites_enabled === true,
      server_icon_url: typeof data.server_icon_url === 'string' ? data.server_icon_url : null,
    });
  },

  'internal:challenge_completed': (_app, data) => {
    const userId = Number(data.user_id);
    if (Number.isFinite(userId)) {
      sendToUser(userId, 'challenge:completed', {
        challenge_id: data.challenge_id,
        title: data.title,
        rewards: data.rewards,
      });
    }
  },

  'internal:profile_news': (_app, data) => {
    const userId = Number(data.user_id);
    if (Number.isFinite(userId)) {
      sendToUser(userId, 'profile:news', {});
    }
  },

  'internal:announcement_delivered': (_app, data) => {
    const userIds = Array.isArray(data.user_ids) ? data.user_ids : [];
    for (const raw of userIds) {
      const userId = Number(raw);
      if (Number.isFinite(userId)) {
        sendToUser(userId, 'announcement:new', { announcement_id: data.announcement_id });
      }
    }
  },

  'internal:reports_changed': (app, data) => {
    void broadcastReportsChanged(data).catch((err: unknown) => {
      app.log.error({ err }, 'reports broadcast');
    });
  },

  'internal:moderation_kick_user': (app, data) => {
    const targetUserId = Number(data.target_user_id);
    // Кик удаляет все членства в приватных каналах.
    clearVoiceChannelAccess();
    if (Number.isFinite(targetUserId)) {
      forceLeaveVoiceForUser(targetUserId);
      forceLogoutUser(app, targetUserId, 'KICKED');
      broadcastAll('member:removed', { user_id: targetUserId, reason: 'kick' });
    }
  },

  'internal:moderation_ban_user': (app, data) => {
    const targetUserId = Number(data.target_user_id);
    if (Number.isFinite(targetUserId)) {
      forceLeaveVoiceForUser(targetUserId);
      forceLogoutUser(app, targetUserId, 'ACCOUNT_DISABLED');
      broadcastAll('member:removed', { user_id: targetUserId, reason: 'ban' });
    }
  },

  'internal:session_revoked': (_app, data) => {
    const sessionId = Number(data.session_id);
    if (!Number.isFinite(sessionId)) return;
    for (const [socket, meta] of [...socketMeta]) {
      if (meta.phase !== 'authed' || meta.sessionId !== sessionId) continue;
      sendWs(socket, 'auth:revoked', { code: 'SESSION_REVOKED' });
      socket.close();
    }
  },

  'internal:channel_access_changed': (app, data) => {
    const channelId = Number(data.channel_id);
    if (!Number.isFinite(channelId)) return;
    const deleted = data.deleted === true;
    const isPrivate = data.is_private === true;
    const rawMembers = data.member_user_ids;
    const memberIds = Array.isArray(rawMembers)
      ? new Set(
          rawMembers.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0),
        )
      : null;
    dropChannelSubscribers(channelId, (userId) => {
      if (deleted) return true;
      if (!isPrivate || memberIds === null) return false;
      return !memberIds.has(userId);
    });
    // Видимость голосовой комнаты могла поменяться: перечитать доступ и разослать снапшот заново.
    forgetVoiceChannelAccess(channelId);
    broadcastVoiceRoomsSnapshot(app);
  },
};

export function registerBusHandlers(app: FastifyInstance): void {
  onPresenceGraceExpired((userId, updateLastSeen) => {
    try {
      kickVoiceUser(userId);
    } catch (err: unknown) {
      app.log.error({ err }, 'voice leave after presence grace');
    }
    broadcastAll('presence:user_status', { user_id: userId, status: 'offline' });
    if (updateLastSeen) {
      writeLastSeen(app, userId);
    }
  });
  subscribeVoiceRoomsSnapshotChanged(() => {
    broadcastVoiceRoomsSnapshot(app);
  });
  subscribeRealtimeEvent(({ event, data }) => {
    const handler = Object.hasOwn(busHandlers, event) ? busHandlers[event] : undefined;
    if (handler) {
      handler(app, data);
      return;
    }
    // Остальные события модулей (user:updated, channel:list_changed, …) — всем как есть.
    broadcastAll(event, data);
  });
}

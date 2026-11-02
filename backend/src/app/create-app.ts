import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Env } from '../config/env.js';
import { registerErrorHandler } from '../core/errors/error-handler.js';
import { registerSetupRoutes } from '../modules/setup/setup.routes.js';
import { registerAuthRoutes } from '../modules/auth/auth.routes.js';
import { registerInvitesRoutes } from '../modules/invites/invites.routes.js';
import { registerChannelsRoutes } from '../modules/channels/channels.routes.js';
import { registerMessagesRoutes } from '../modules/messages/messages.routes.js';
import { registerUsersRoutes } from '../modules/users/users.routes.js';
import { registerGameActivityRoutes } from '../modules/game-activity/game-activity.routes.js';
import { registerAvatarsRoutes } from '../modules/avatars/avatars.routes.js';
import { registerBadgesRoutes } from '../modules/badges/badges.routes.js';
import { registerChallengesRoutes } from '../modules/challenges/challenges.routes.js';
import { registerProfileNewsRoutes } from '../modules/profile-news/profile-news.routes.js';
import { registerCosmeticTextsRoutes } from '../modules/cosmetics/cosmetic-texts.routes.js';
import { registerModerationRoutes } from '../modules/moderation/moderation.routes.js';
import { registerAnnouncementsRoutes } from '../modules/announcements/announcements.routes.js';
import { registerReportsRoutes } from '../modules/reports/reports.routes.js';
import { registerRolesRoutes } from '../modules/roles/roles.routes.js';
import { registerServerSettingsRoutes } from '../modules/server-settings/server-settings.routes.js';
import { registerWordFilterRoutes } from '../modules/word-filter/word-filter.routes.js';
import { registerAttachmentsRoutes } from '../modules/attachments/attachments.routes.js';
import { registerEmojisRoutes } from '../modules/emojis/emojis.routes.js';
import { registerServerIconRoutes } from '../modules/server-icon/server-icon.routes.js';
import { registerWsMessaging } from '../modules/realtime/ws-messaging.js';
import { prisma } from '../core/database/prisma.js';
import { closeMediasoupVoiceWorker } from '../modules/voice/mediasoup-voice.service.js';

/** Origin окна Electron. Один и тот же у всех установок, не зависит от адреса сервера. */
const DESKTOP_APP_ORIGIN = 'app://hooba';

/** 0 — не доверять X-Forwarded-For. Иначе доверять только первым `hops` адресам цепочки. */
export function trustProxySetting(hops: number): false | ((address: string, hop: number) => boolean) {
  if (hops <= 0) return false;
  return (_address, hop) => hop < hops;
}

function createCorsOriginChecker(env: Env, log: { warn: (o: Record<string, unknown>, m: string) => void }) {
  const allowed = new Set(env.frontendOrigins);
  allowed.add(DESKTOP_APP_ORIGIN);
  const devHost = env.CORS_DEV_HOSTNAME?.trim();

  return (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
    if (origin === undefined || origin === '') {
      cb(null, true);
      return;
    }
    if (allowed.has(origin)) {
      cb(null, true);
      return;
    }
    if (env.NODE_ENV === 'development' && devHost) {
      try {
        if (new URL(origin).hostname === devHost) {
          cb(null, true);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    if (env.NODE_ENV === 'development') {
      log.warn(
        { origin, FRONTEND_ORIGIN: env.frontendOrigins, CORS_DEV_HOSTNAME: devHost ?? null },
        'CORS: запрос с Origin не из FRONTEND_ORIGIN; добавьте полный URL в FRONTEND_ORIGIN или задайте CORS_DEV_HOSTNAME (только dev)',
      );
    }
    cb(null, false);
  };
}

export async function createApp(env: Env) {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    trustProxy: trustProxySetting(env.TRUST_PROXY_HOPS),
  });
  app.decorate('appEnv', env);

  app.addHook('onClose', async () => {
    await closeMediasoupVoiceWorker();
  });

  await app.register(cors, {
    origin: createCorsOriginChecker(env, app.log),
    credentials: true,
    // По умолчанию у @fastify/cors только GET, HEAD, POST. Из app://hooba
    // браузер сначала шлёт preflight, и PATCH/DELETE без этого списка падают.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  registerErrorHandler(app);

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  await registerSetupRoutes(app);
  await registerAuthRoutes(app);
  await registerInvitesRoutes(app);
  await registerChannelsRoutes(app);
  await registerMessagesRoutes(app);
  await registerUsersRoutes(app);
  await registerGameActivityRoutes(app);
  await registerAvatarsRoutes(app);
  await registerBadgesRoutes(app);
  await registerChallengesRoutes(app);
  await registerProfileNewsRoutes(app);
  await registerCosmeticTextsRoutes(app);
  await registerModerationRoutes(app);
  await registerReportsRoutes(app);
  await registerAnnouncementsRoutes(app);
  await registerRolesRoutes(app);
  await registerWordFilterRoutes(app);
  await registerServerSettingsRoutes(app);
  await registerAttachmentsRoutes(app);
  await registerEmojisRoutes(app);
  await registerServerIconRoutes(app);
  await registerWsMessaging(app);

  return app;
}

import 'dotenv/config';
import './types/fastify-augment.js';
import { loadEnv } from './config/env.js';
import { createApp } from './app/create-app.js';
import { attachShutdownHandlers } from './app/shutdown.js';
import { purgeExpiredRefreshSessions } from './core/auth/refresh-session.js';
import { runAttachmentMaintenance } from './modules/attachments/attachments.service.js';
import { startAnnouncementScheduler } from './modules/announcements/announcement-scheduler.js';
import { startActivitySampler } from './modules/activity/activity-sampler.js';
import { startChallengeEvaluator } from './modules/challenges/challenge-evaluator.js';
import {
  disposeMediasoupPeerForSocket,
  setMediasoupProducerPaused,
  startMediasoupVoiceWorker,
  closeVoiceRouter,
} from './modules/voice/mediasoup-voice.service.js';
import {
  registerVoiceMediaSocketCloser,
  registerVoiceProducerPauser,
  registerVoiceRoomIdle,
} from './modules/voice/voice-media-bridge.js';

const env = loadEnv();
if (env.setupTokenGenerated) {
  console.log(`[setup] SETUP_TOKEN не задан. Одноразовый токен bootstrap: ${env.setupToken}`);
}
await startMediasoupVoiceWorker(env);
registerVoiceMediaSocketCloser(disposeMediasoupPeerForSocket);
registerVoiceProducerPauser(setMediasoupProducerPaused);
registerVoiceRoomIdle(closeVoiceRouter);

const app = await createApp(env);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err: unknown) {
  app.log.error(err);
  process.exit(1);
}

attachShutdownHandlers(app);
const purgeExpiredSessions = () => {
  void purgeExpiredRefreshSessions().catch((err: unknown) => {
    app.log.error(err);
  });
};
purgeExpiredSessions();
const purgeTimer = setInterval(purgeExpiredSessions, 60 * 60 * 1000);
purgeTimer.unref();

// Картинки чата: неотправленные старше часа и квота хранилища (80% → 70%).
const maintainAttachments = () => {
  void runAttachmentMaintenance()
    .then(({ stale, purged }) => {
      if (stale > 0 || purged > 0) {
        app.log.info({ stale, purged }, 'attachments maintenance');
      }
    })
    .catch((err: unknown) => {
      app.log.error(err);
    });
};
maintainAttachments();
const attachmentsTimer = setInterval(maintainAttachments, 10 * 60 * 1000);
attachmentsTimer.unref();

// Испытания: раз в минуту голос, видимая игра и онлайн — в почасовые копилки активности.
startActivitySampler((err: unknown) => {
  app.log.error({ err }, 'activity sampler');
});
// Раз в 30 с проверяет испытания у тех, чья активность выросла; при старте — у всех.
startChallengeEvaluator((err: unknown) => {
  app.log.error({ err }, 'challenge evaluator');
});
// Объявления владельца: в начале каждой минуты фиксирует получателей тех, чья дата наступила, и будит их клиенты.
startAnnouncementScheduler((err: unknown) => {
  app.log.error({ err }, 'announcement scheduler');
});

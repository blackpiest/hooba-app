import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { clientAddressForIce, rememberWsClientIp } from '../voice/ws-client-ip.js';
import { WS_MAX_PAYLOAD_BYTES } from './socket-policy.js';
import {
  allowSocketEvent,
  sendError,
  sendWs,
  setSocketMeta,
  socketMeta,
  socketOpenedAt,
  touchSocketActivity,
} from './ws-registry.js';
import { ensureStaleActivitySweep, handleIdentify, handleSocketClose, noteSocketPong } from './ws-session.js';
import { registerBusHandlers } from './bus-handlers.js';
import { chatHandlers } from './handlers/chat.js';
import { presenceHandlers } from './handlers/presence.js';
import { voiceHandlers } from './handlers/voice.js';
import type { WsHandler } from './handlers/types.js';

/** События авторизованного сокета. Имя приходит от клиента — только Map, без ключей прототипа. */
const authedHandlers = new Map<string, WsHandler>(
  Object.entries({ ...presenceHandlers, ...chatHandlers, ...voiceHandlers }),
);

export async function registerWsMessaging(app: FastifyInstance): Promise<void> {
  await app.register(websocket, { options: { maxPayload: WS_MAX_PAYLOAD_BYTES } });
  ensureStaleActivitySweep(app);
  registerBusHandlers(app);

  app.get('/ws', { websocket: true }, (socket, req) => {
    const rawIp =
      typeof req.socket?.remoteAddress === 'string'
        ? req.socket.remoteAddress
        : typeof req.ip === 'string'
          ? req.ip
          : undefined;
    rememberWsClientIp(socket, clientAddressForIce(rawIp, req.headers['x-forwarded-for']));
    setSocketMeta(socket, { phase: 'guest' });
    socketOpenedAt.set(socket, Date.now());
    touchSocketActivity(socket);
    noteSocketPong(socket);
    socket.on('pong', () => {
      noteSocketPong(socket);
    });

    /** Строго последовательная обработка входящих кадров — иначе `message:send` может обогнать `channel:join` с await. */
    let handleSeq = Promise.resolve();

    socket.on('message', (raw) => {
      handleSeq = handleSeq
        .then(async () => {
          let envelope: { event?: unknown; data?: unknown; meta?: { requestId?: string } };
          try {
            envelope = JSON.parse(raw.toString()) as typeof envelope;
          } catch {
            sendError(socket, 'INVALID_EVENT');
            return;
          }

          const event = typeof envelope.event === 'string' ? envelope.event : '';
          const data =
            envelope.data && typeof envelope.data === 'object'
              ? (envelope.data as Record<string, unknown>)
              : {};
          const requestId =
            (envelope as { request_id?: unknown }).request_id &&
            typeof (envelope as { request_id?: unknown }).request_id === 'string'
              ? ((envelope as { request_id: string }).request_id as string)
              : envelope.meta && typeof envelope.meta.requestId === 'string'
              ? envelope.meta.requestId
              : undefined;

          const m = socketMeta.get(socket);
          if (!m) return;
          touchSocketActivity(socket);

          if (event === 'ping' || event === 'system:ping') {
            sendWs(socket, 'system:pong', {}, requestId);
            return;
          }

          if (!allowSocketEvent(socket)) {
            sendError(socket, 'RATE_LIMITED', requestId);
            return;
          }

          if (m.phase === 'authed' && event !== 'auth:identify' && Date.now() >= m.accessExpMs) {
            sendWs(socket, 'auth:expired', { code: 'ACCESS_EXPIRED' }, requestId);
            socket.close();
            return;
          }

          if (event === 'auth:identify') {
            await handleIdentify(app, socket, data, requestId);
            return;
          }

          if (m.phase !== 'authed') {
            sendError(socket, 'UNAUTHORIZED', requestId);
            return;
          }

          const handler = authedHandlers.get(event);
          if (!handler) {
            sendError(socket, 'INVALID_EVENT', requestId);
            return;
          }
          await handler({ app, socket, event, meta: m, data, requestId });
        })
        .catch((err: unknown) => {
          app.log.error({ err }, 'ws message handler');
          sendError(socket, 'INVALID_EVENT');
        });
    });

    socket.on('close', () => {
      handleSocketClose(socket);
    });
  });
}

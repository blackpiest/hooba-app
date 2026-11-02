import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { AuthedMeta } from '../ws-registry.js';

/** Кадр от сокета, уже прошедшего auth:identify. */
export type WsContext = {
  app: FastifyInstance;
  socket: WebSocket;
  event: string;
  meta: AuthedMeta;
  data: Record<string, unknown>;
  requestId: string | undefined;
};

export type WsHandler = (ctx: WsContext) => void | Promise<void>;

export type WsHandlers = Record<string, WsHandler>;

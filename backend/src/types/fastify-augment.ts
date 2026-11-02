import type { Env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: number; username: string };
  }

  interface FastifyInstance {
    appEnv: Env;
  }
}

export {};

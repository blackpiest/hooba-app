import type { FastifyInstance } from 'fastify';
import { ok } from '../../core/http/response.js';
import { AppError } from '../../core/errors/app-error.js';
import { consumeRateLimit } from '../../core/http/rate-limit.js';
import { setupTokensMatch } from './setup-token.js';
import { bootstrapBodySchema } from './setup.schemas.js';
import * as setupService from './setup.service.js';

const SETUP_LIMIT = 5;
const SETUP_WINDOW_MS = 60_000;

export async function registerSetupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/setup/status', async (_request, reply) => {
    const data = await setupService.getSetupStatus();
    return reply.send(ok(data));
  });

  app.post('/api/v1/setup/bootstrap', async (request, reply) => {
    if (!consumeRateLimit(`setup:bootstrap:${request.ip}`, SETUP_LIMIT, SETUP_WINDOW_MS)) {
      throw new AppError('RATE_LIMITED', 429, 'Too many requests');
    }
    request.log.info({ evt: 'bootstrap_started' });
    const parsed = bootstrapBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first ? `${String(first.path[0] ?? 'body')}: ${first.message}` : 'Invalid body';
      throw new AppError('VALIDATION_ERROR', 400, msg);
    }
    const b = parsed.data;
    if (!setupTokensMatch(app.appEnv.setupToken, b.setup_token)) {
      throw new AppError('SETUP_FORBIDDEN', 401, 'Invalid setup token');
    }
    const data = await setupService.bootstrapServer({
      serverName: b.server_name,
      ownerUsername: b.owner_username,
      ownerPassword: b.owner_password,
    });
    request.log.info({ evt: 'bootstrap_success', ownerUsername: data.ownerUsername });
    return reply.send(ok(data));
  });
}

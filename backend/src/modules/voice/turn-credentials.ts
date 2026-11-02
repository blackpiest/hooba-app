import { createHmac } from 'node:crypto';

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const TURN_TTL_SEC = 3600;

function urlsOf(server: IceServer): string[] {
  return Array.isArray(server.urls) ? server.urls : [server.urls];
}

function isTurnUrl(url: string): boolean {
  return /^(turn|turns):/i.test(url.trim());
}

/**
 * Убирает долгоживущие username/credential из JSON и, если задан секрет coturn,
 * подставляет пару REST API: username `expiry:userId`, credential HMAC-SHA1.
 */
export function iceServersForVoiceClient(
  servers: IceServer[],
  opts: { secret: string | undefined; userId: number; nowSec: number },
): IceServer[] {
  const secret = opts.secret?.trim() ?? '';
  const username = `${opts.nowSec + TURN_TTL_SEC}:${opts.userId}`;
  const credential =
    secret.length > 0 ? createHmac('sha1', secret).update(username).digest('base64') : undefined;
  return servers.map((server) => {
    const urls = server.urls;
    const hasTurn = urlsOf(server).some((url) => typeof url === 'string' && isTurnUrl(url));
    if (hasTurn && credential) {
      return { urls, username, credential };
    }
    return { urls };
  });
}

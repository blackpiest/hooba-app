import * as jose from 'jose';
import type { Env } from '../../config/env.js';

export type AccessTokenClaims = {
  userId: number;
  username: string;
  sessionVersion: number;
  /** id строки RefreshSession. null — токен, выпущенный до появления sid. */
  sessionId: number | null;
  expiresAtMs: number;
};

export async function signAccessToken(
  env: Env,
  payload: { userId: number; username: string; sessionVersion: number; sessionId: number },
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new jose.SignJWT({
    username: payload.username,
    sv: payload.sessionVersion,
    sid: payload.sessionId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.userId))
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_EXPIRES_SEC}s`)
    .sign(secret);
}

function readSessionId(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export async function verifyAccessToken(env: Env, token: string): Promise<AccessTokenClaims> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const { payload } = await jose.jwtVerify(token, secret, { algorithms: ['HS256'] });
  const sub = payload.sub;
  if (!sub) {
    throw new Error('missing sub');
  }
  const userId = Number(sub);
  if (!Number.isFinite(userId)) {
    throw new Error('invalid sub');
  }
  const rawSv = payload.sv;
  const sessionVersion = typeof rawSv === 'number' && Number.isInteger(rawSv) && rawSv >= 0 ? rawSv : 0;
  const exp = payload.exp;
  if (typeof exp !== 'number') {
    throw new Error('missing exp');
  }
  return {
    userId,
    username: String(payload.username ?? ''),
    sessionVersion,
    sessionId: readSessionId(payload.sid),
    expiresAtMs: exp * 1000,
  };
}

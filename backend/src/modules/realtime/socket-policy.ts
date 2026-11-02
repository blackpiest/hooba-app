export const MAX_SOCKETS_PER_USER = 4;
export const GUEST_IDENTIFY_MS = 10_000;
export const WS_MAX_PAYLOAD_BYTES = 256 * 1024;

export function isGuestTimedOut(openedAtMs: number, nowMs: number): boolean {
  return nowMs - openedAtMs >= GUEST_IDENTIFY_MS;
}

export function acceptsAnotherSocket(openSocketsForUser: number): boolean {
  return openSocketsForUser < MAX_SOCKETS_PER_USER;
}

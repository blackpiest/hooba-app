import type { WebSocket } from 'ws';

export function sendWsEnvelope(socket: WebSocket, event: string, data: unknown, requestId?: string) {
  const envelope = requestId
    ? { event, data, request_id: requestId, meta: { requestId } }
    : { event, data, meta: {} };
  socket.send(JSON.stringify(envelope));
}

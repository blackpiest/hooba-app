import type { WebSocket } from 'ws';

/**
 * У `@fastify/websocket` у объекта `WebSocket` часто нет `_socket.remoteAddress`,
 * из-за чего mediasoup не видит loopback и не подставляет 127.0.0.1 в ICE.
 * IP запоминаем из запроса в момент upgrade.
 */
const wsClientIp = new WeakMap<WebSocket, string | undefined>();

export function rememberWsClientIp(socket: WebSocket, address: string | undefined): void {
  wsClientIp.set(socket, address);
}

export function getRememberedWsClientIp(socket: WebSocket): string | undefined {
  return wsClientIp.get(socket);
}

/**
 * Адрес клиента только для выбора режима ICE (loopback или нет), не для прав и лимитов.
 * За прокси на той же машине (Vite dev, nginx на хосте) сокет приходит с 127.0.0.1 у всех.
 * Тогда берём первый адрес из X-Forwarded-For. Подделка заголовка ломает ICE только самому
 * подделавшему, поэтому доверять ему здесь безопасно.
 */
export function clientAddressForIce(
  rawRemote: string | undefined,
  forwardedFor: string | string[] | undefined,
): string | undefined {
  const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const first = header?.split(',')[0]?.trim();
  return first ? first : rawRemote;
}

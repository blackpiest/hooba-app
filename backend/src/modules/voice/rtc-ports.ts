/** Диапазон портов транспортов без порта WebRtcServer, если тот стоит на краю диапазона. */
export function transportPortRange(
  min: number,
  max: number,
  serverPort: number | undefined,
): { rtcMinPort: number; rtcMaxPort: number } {
  if (serverPort === undefined || max <= min) {
    return { rtcMinPort: min, rtcMaxPort: max };
  }
  if (serverPort === min) {
    return { rtcMinPort: min + 1, rtcMaxPort: max };
  }
  if (serverPort === max) {
    return { rtcMinPort: min, rtcMaxPort: max - 1 };
  }
  return { rtcMinPort: min, rtcMaxPort: max };
}

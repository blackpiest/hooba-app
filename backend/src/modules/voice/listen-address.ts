import { networkInterfaces } from 'node:os';
import type { Env } from '../../config/env.js';

export type ListenEnv = Pick<
  Env,
  'MEDIASOUP_ANNOUNCED_IP' | 'MEDIASOUP_ANNOUNCE_LOCALHOST' | 'MEDIASOUP_BIND_IP' | 'MEDIASOUP_LISTEN_IP' | 'MEDIASOUP_BIND_TO_ANNOUNCED'
>;

function isLikelyIpv4(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host.trim());
}

function localInterfaceIps(): Set<string> {
  const ips = new Set<string>();
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      ips.add(info.address);
    }
  }
  return ips;
}

let warnedMissingAnnounced = false;

/**
 * Адрес для клиентов не с loopback: bind и announced из env.
 * MEDIASOUP_BIND_TO_ANNOUNCED срабатывает, только если announced есть на интерфейсе машины:
 * в Docker (bridge) и за NAT провайдера публичного IP на интерфейсе нет — bind на него падает.
 */
export function remoteListenAddress(
  env: ListenEnv,
  localIps: () => Set<string> = localInterfaceIps,
): { bindIp: string; announced: string | undefined } {
  let announced = env.MEDIASOUP_ANNOUNCED_IP?.trim() || undefined;
  if (!announced && env.MEDIASOUP_ANNOUNCE_LOCALHOST === '1') {
    announced = '127.0.0.1';
  }
  const explicitBind = env.MEDIASOUP_BIND_IP?.trim();
  let bindIp = explicitBind || env.MEDIASOUP_LISTEN_IP.trim();
  if (!explicitBind && env.MEDIASOUP_BIND_TO_ANNOUNCED === '1' && announced && isLikelyIpv4(announced)) {
    if (localIps().has(announced)) {
      bindIp = announced;
    } else if (!warnedMissingAnnounced) {
      warnedMissingAnnounced = true;
      console.warn(
        `[mediasoup] MEDIASOUP_BIND_TO_ANNOUNCED=1, но ${announced} нет на интерфейсах (Docker/NAT) — bind на ${bindIp}.`,
      );
    }
  }
  return { bindIp, announced };
}

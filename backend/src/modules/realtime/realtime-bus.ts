type RealtimeBusEvent = {
  event: string;
  data: Record<string, unknown>;
};

type RealtimeBusListener = (payload: RealtimeBusEvent) => void;

const listeners = new Set<RealtimeBusListener>();

export function publishRealtimeEvent(event: string, data: Record<string, unknown> = {}): void {
  for (const listener of listeners) {
    listener({ event, data });
  }
}

export function subscribeRealtimeEvent(listener: RealtimeBusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

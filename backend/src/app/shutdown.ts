type Closable = {
  close: () => Promise<void>;
  log: { error: (err: unknown) => void };
};

type SignalTarget = {
  on: (signal: NodeJS.Signals, listener: () => void) => void;
};

/** SIGTERM/SIGINT закрывают Fastify, а хук onClose вместе с ним гасит mediasoup. */
export function attachShutdownHandlers(app: Closable, target: SignalTarget = process): void {
  let closing = false;
  const shutdown = () => {
    if (closing) {
      return;
    }
    closing = true;
    void app.close().catch((err: unknown) => {
      app.log.error(err);
      process.exit(1);
    });
  };
  target.on('SIGTERM', shutdown);
  target.on('SIGINT', shutdown);
}

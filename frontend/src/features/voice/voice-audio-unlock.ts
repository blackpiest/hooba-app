let primed: AudioContext | null = null;

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    throw new Error('no_audio_context');
  }
  return new Ctx();
}

/**
 * Синхронно из клика «войти в канал» или смены микрофона, до любых await.
 * Иначе к моменту сборки графа жест уже истёк, контекст остаётся suspended,
 * и в канал уходит тишина, пока пользователь не переключит устройство.
 */
export function primeVoiceAudioFromUserGesture(): void {
  if (!primed || primed.state === 'closed') {
    try {
      primed = createAudioContext();
    } catch {
      primed = null;
      return;
    }
  }
  const ctx = primed;
  void ctx
    .resume()
    .then(() => {
      if (ctx.state !== 'running') {
        return;
      }
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
    })
    .catch(() => {
      /* нет user activation */
    });
}

export function takePrimedVoiceAudioContext(): AudioContext | null {
  const ctx = primed;
  primed = null;
  if (!ctx || ctx.state === 'closed') {
    return null;
  }
  return ctx;
}

export function discardPrimedVoiceAudioContext(): void {
  const ctx = primed;
  primed = null;
  if (ctx && ctx.state !== 'closed') {
    void ctx.close();
  }
}

export function listenForUserGesture(listener: () => void): () => void {
  const onGesture = () => {
    listener();
  };
  document.addEventListener('pointerdown', onGesture, true);
  document.addEventListener('keydown', onGesture, true);
  return () => {
    document.removeEventListener('pointerdown', onGesture, true);
    document.removeEventListener('keydown', onGesture, true);
  };
}

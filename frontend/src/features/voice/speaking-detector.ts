const SPEAK_ON = 0.022;
const SPEAK_OFF = 0.012;
const HOLD_MS = 360;

type SpeakingDetector = {
  /** Уровень после громкости микрофона, в том же AudioContext, что и исходящий поток. */
  attach: (node: AudioNode) => void;
  /** Запасной путь, если граф микрофона не собрался. */
  attachTrack: (track: MediaStreamTrack) => void;
  setMuted: (muted: boolean) => void;
  stop: () => void;
};

/**
 * Локальный порог по микрофону. Шлёт только смену состояния, не каждый кадр.
 * Отдельный AudioContext на тот же трек в Chrome часто молчит: звук уже забран
 * графом, который уходит в звонок. Поэтому слушаем этот граф.
 */
export function createSpeakingDetector(options: {
  onChange: (speaking: boolean) => void;
}): SpeakingDetector {
  let analyser: AnalyserNode | null = null;
  let samples = new Uint8Array(0);
  let tapped: AudioNode | null = null;
  let fallbackContext: AudioContext | null = null;
  let fallbackSource: MediaStreamAudioSourceNode | null = null;
  let speaking = false;
  let muted = false;
  let changedAt = 0;

  function emit(next: boolean) {
    if (next === speaking) {
      return;
    }
    speaking = next;
    changedAt = Date.now();
    options.onChange(next);
  }

  function detachTap() {
    if (!tapped || !analyser) {
      tapped = null;
      return;
    }
    try {
      tapped.disconnect(analyser);
    } catch {
      /* уже отключён вместе с графом */
    }
    tapped = null;
  }

  function releaseFallback() {
    try {
      fallbackSource?.disconnect();
    } catch {
      /* already disconnected */
    }
    fallbackSource = null;
    if (fallbackContext) {
      void fallbackContext.close();
      fallbackContext = null;
    }
  }

  function ensureAnalyser(context: BaseAudioContext) {
    if (analyser && analyser.context === context) {
      return;
    }
    detachTap();
    try {
      analyser?.disconnect();
    } catch {
      /* already disconnected */
    }
    analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.35;
    samples = new Uint8Array(analyser.fftSize);
    if (context.state === "suspended" && context instanceof AudioContext) {
      void context.resume();
    }
  }

  function attach(node: AudioNode) {
    if (fallbackContext && node.context !== fallbackContext) {
      releaseFallback();
    }
    ensureAnalyser(node.context);
    detachTap();
    if (!analyser) {
      return;
    }
    node.connect(analyser);
    tapped = node;
  }

  function attachTrack(track: MediaStreamTrack) {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return;
    }
    if (!fallbackContext) {
      fallbackContext = new Ctx();
    }
    void fallbackContext.resume();
    try {
      fallbackSource?.disconnect();
    } catch {
      /* already disconnected */
    }
    fallbackSource = fallbackContext.createMediaStreamSource(new MediaStream([track]));
    attach(fallbackSource);
  }

  const timer = window.setInterval(() => {
    const context = analyser?.context;
    if (context?.state === "suspended" && context instanceof AudioContext) {
      void context.resume();
    }
    if (context?.state === "closed") {
      emit(false);
      return;
    }
    if (muted || !analyser || !tapped) {
      emit(false);
      return;
    }
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = ((samples[i] ?? 128) - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / samples.length);
    const now = Date.now();
    if (!speaking && rms >= SPEAK_ON) {
      emit(true);
      return;
    }
    if (speaking && rms <= SPEAK_OFF && now - changedAt >= HOLD_MS) {
      emit(false);
    }
  }, 80);

  return {
    attach,
    attachTrack,
    setMuted(next) {
      muted = next;
      if (next) {
        emit(false);
      }
    },
    stop() {
      window.clearInterval(timer);
      emit(false);
      detachTap();
      try {
        analyser?.disconnect();
      } catch {
        /* already disconnected */
      }
      analyser = null;
      releaseFallback();
    },
  };
}

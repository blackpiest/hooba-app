import { attachOutputWarmup, createLimiter, rampGain } from "@/features/voice/voice-loudness";

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    throw new Error("no_audio_context");
  }
  return new Ctx();
}

type BoostGraph = {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  dest: MediaStreamAudioDestinationNode;
  /** Chromium не отдаёт удалённый WebRTC-трек в Web Audio, пока его не играет медиаэлемент. */
  pump: HTMLAudioElement;
};

export type ScreenAudioPlayback = {
  /** 1 = 100%. Выше 1 — усиление через GainNode с лимитером. */
  setLevel: (level: number) => void;
  dispose: () => void;
};

/**
 * Звук демонстрации у зрителя. До 100% играем трек как есть и меняем `<audio>.volume`;
 * выше 100% `volume` обрезается, поэтому собираем граф gain → limiter (как у голосов участников).
 * `muted` элемента остаётся за вызывающим кодом.
 */
export function createScreenAudioPlayback(el: HTMLAudioElement, track: MediaStreamTrack): ScreenAudioPlayback {
  let boost: BoostGraph | null = null;
  let disposed = false;

  const play = (target: HTMLAudioElement) => {
    void target.play().catch(() => {
      /* autoplay: ждём жест пользователя */
    });
  };

  const playDirect = () => {
    el.srcObject = new MediaStream([track]);
    play(el);
  };

  const clearBoost = () => {
    if (!boost) {
      return;
    }
    const graph = boost;
    boost = null;
    graph.pump.pause();
    graph.pump.srcObject = null;
    for (const destTrack of graph.dest.stream.getTracks()) {
      destTrack.stop();
    }
    void graph.ctx.close().catch(() => {});
  };

  const buildBoost = (level: number): boolean => {
    let ctx: AudioContext | null = null;
    try {
      ctx = createAudioContext();
      void ctx.resume();
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      const gain = ctx.createGain();
      gain.gain.value = level;
      const limiter = createLimiter(ctx);
      const dest = ctx.createMediaStreamDestination();
      source.connect(gain);
      gain.connect(limiter);
      attachOutputWarmup(ctx, limiter).connect(dest);
      const pump = document.createElement("audio");
      pump.muted = true;
      pump.autoplay = true;
      pump.setAttribute("playsinline", "true");
      pump.srcObject = new MediaStream([track]);
      play(pump);
      boost = { ctx, source, gain, dest, pump };
      el.srcObject = dest.stream;
      el.volume = 1;
      play(el);
      return true;
    } catch {
      void ctx?.close().catch(() => {});
      return false;
    }
  };

  playDirect();

  return {
    setLevel(level) {
      if (disposed) {
        return;
      }
      const safe = Number.isFinite(level) ? Math.max(0, level) : 1;
      if (safe <= 1) {
        if (boost) {
          clearBoost();
          playDirect();
        }
        el.volume = safe;
        return;
      }
      if (boost) {
        el.volume = 1;
        rampGain(boost.gain, safe);
        return;
      }
      if (!buildBoost(safe)) {
        el.volume = 1;
      }
    },
    dispose() {
      disposed = true;
      clearBoost();
      el.srcObject = null;
    },
  };
}

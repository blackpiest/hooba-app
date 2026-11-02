import { useEffect, useState } from "react";

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    throw new Error("no_audio_context");
  }
  return new Ctx();
}

function readRms(analyser: AnalyserNode, samples: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(samples);
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = ((samples[i] ?? 128) - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Уровень дорожки 0–1 для индикатора ведущего. Только анализ: в `destination` не подключаем,
 * иначе ведущий услышит свой же системный звук.
 */
export function useTrackLevel(track: MediaStreamTrack | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!track) {
      return;
    }
    let context: AudioContext;
    try {
      context = createAudioContext();
    } catch {
      return;
    }
    void context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.45;
    const samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    const source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);

    let raf = 0;
    let smooth = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick);
      if (context.state === "suspended") {
        void context.resume();
      }
      const target = Math.min(1, readRms(analyser, samples) * 8);
      smooth = target > smooth ? smooth * 0.35 + target * 0.65 : smooth * 0.72 + target * 0.28;
      if (now - lastUi < 100) {
        return;
      }
      lastUi = now;
      setLevel(smooth < 0.01 ? 0 : smooth);
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
      void context.close();
      setLevel(0);
    };
  }, [track]);

  return track ? level : 0;
}

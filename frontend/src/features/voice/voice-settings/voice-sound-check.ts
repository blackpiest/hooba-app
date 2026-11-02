import speakerTestUrl from "@/assets/sounds/speaker-test.wav";
import { connectMicChain, micProcessingConstraints } from "../voice-mic-chain";
import { rampGain } from "../voice-loudness";

type AudioCtxWithSink = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

export type MicCheckHandle = {
  setInputGain: (gain: number) => void;
  setOutputGain: (gain: number) => void;
  setSinkId: (sinkId: string) => Promise<void>;
  stop: () => void;
};

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    throw new Error("no_audio_context");
  }
  return new Ctx();
}

async function applySink(ctx: AudioContext, sinkId: string): Promise<void> {
  const anyCtx = ctx as AudioCtxWithSink;
  if (typeof anyCtx.setSinkId !== "function") {
    return;
  }
  try {
    await anyCtx.setSinkId(sinkId);
  } catch {
    /* устройство недоступно */
  }
}

async function acquireTestMic(deviceId: string): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) {
    throw new DOMException("media devices unavailable", "NotSupportedError");
  }
  const processing = micProcessingConstraints();
  const audio: MediaTrackConstraints = {
    ...processing,
    echoCancellation: false,
  };
  if (!deviceId) {
    return md.getUserMedia({ audio, video: false });
  }
  try {
    return await md.getUserMedia({
      audio: { ...audio, deviceId: { exact: deviceId } },
      video: false,
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
      return md.getUserMedia({
        audio: { ...audio, deviceId: { ideal: deviceId } },
        video: false,
      });
    }
    throw error;
  }
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
 * Слышать себя в выбранных динамиках. Эхоподавление выключено, иначе браузер
 * вырезает этот же звук из микрофона. Шумоподавление — как в звонке.
 */
export async function startMicCheck(options: {
  deviceId: string;
  inputGain: number;
  outputGain: number;
  sinkId: string;
  onLevel: (level: number) => void;
}): Promise<MicCheckHandle> {
  const context = createAudioContext();
  void context.resume();
  let stream: MediaStream | null = null;
  let stopped = false;
  let raf = 0;
  let source: MediaStreamAudioSourceNode | null = null;
  let stopChain = () => {};

  const stop = () => {
    stopped = true;
    window.cancelAnimationFrame(raf);
    stopChain();
    try {
      source?.disconnect();
    } catch {
      /* already disconnected */
    }
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    void context.close();
    options.onLevel(0);
  };

  try {
    stream = await acquireTestMic(options.deviceId);
    if (stopped) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      void context.close();
      return { setInputGain() {}, setOutputGain() {}, setSinkId: async () => {}, stop() {} };
    }
    await applySink(context, options.sinkId);
    void context.resume();

    const input = context.createGain();
    input.gain.value = options.inputGain;
    const output = context.createGain();
    output.gain.value = options.outputGain;
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.45;
    const samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    source = context.createMediaStreamSource(stream);
    const chain = connectMicChain(context, source, input);
    if (stopped) {
      chain.stop();
      stop();
      return { setInputGain() {}, setOutputGain() {}, setSinkId: async () => {}, stop() {} };
    }
    stopChain = chain.stop;
    chain.output.connect(output);
    input.connect(analyser);
    output.connect(context.destination);

    let smooth = 0;
    let lastSent = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      if (stopped) {
        return;
      }
      if (context.state === "suspended") {
        void context.resume();
      }
      raf = window.requestAnimationFrame(tick);
      const target = Math.min(1, readRms(analyser, samples) * 8);
      smooth = target > smooth ? smooth * 0.35 + target * 0.65 : smooth * 0.72 + target * 0.28;
      if (now - lastUi < 50 && Math.abs(smooth - lastSent) < 0.03) {
        return;
      }
      lastUi = now;
      lastSent = smooth;
      options.onLevel(smooth);
    };
    raf = window.requestAnimationFrame(tick);

    return {
      setInputGain(gain: number) {
        rampGain(input, gain);
      },
      setOutputGain(gain: number) {
        rampGain(output, gain);
      },
      setSinkId(sinkId: string) {
        return applySink(context, sinkId);
      },
      stop,
    };
  } catch (error) {
    stop();
    throw error;
  }
}

export function micCheckErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Разрешите доступ к микрофону, чтобы его проверить.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Выбранный микрофон не найден.";
  }
  if (name === "NotReadableError") {
    return "Микрофон занят другим приложением.";
  }
  return "Не удалось включить микрофон.";
}

let speakerToken = 0;
let speakerContext: AudioContext | null = null;

export function stopSpeakerCheck(): void {
  speakerToken += 1;
  const ctx = speakerContext;
  speakerContext = null;
  if (ctx) {
    void ctx.close();
  }
}

/** Стереосигнал (слева, справа, оба канала) в выбранные динамики с учётом громкости (0–2). */
export async function playSpeakerCheck(sinkId: string, outputGain: number): Promise<void> {
  stopSpeakerCheck();
  const token = speakerToken;
  const context = createAudioContext();
  speakerContext = context;
  try {
    await context.resume();
    if (token !== speakerToken) {
      return;
    }
    await applySink(context, sinkId);
    const encoded = await (await fetch(speakerTestUrl)).arrayBuffer();
    const buffer = await context.decodeAudioData(encoded);
    if (token !== speakerToken) {
      return;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = Math.max(0, outputGain);
    source.connect(gain);
    gain.connect(context.destination);
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  } finally {
    if (speakerContext === context) {
      speakerContext = null;
      void context.close();
    }
  }
}

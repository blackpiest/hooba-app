import { getOutputVolume, volumeToGain } from "@/shared/lib/voice-volume-prefs";
import { isLocalUserDeafened } from "./voice-channel-sounds";
import { getVoiceDeviceIds } from "./voice-settings/voice-settings";

type AudioCtxWithSink = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

const PLAYBACK_VOLUME = 0.45;
const TONE_LEVEL = 0.3;
const TONE_SECONDS = 0.07;
const ATTACK_SECONDS = 0.005;

/**
 * Отдельный контекст только для тонов рации: он пишет прямо в динамики
 * и не связан с микрофонной цепочкой, поэтому звук не уходит в producer.
 */
let toneContext: AudioContext | null = null;
let appliedSink: string | null = null;

function ensureToneContext(): AudioContext | null {
  if (toneContext && toneContext.state !== "closed") {
    return toneContext;
  }
  if (typeof window === "undefined") {
    return null;
  }
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  toneContext = new Ctx();
  appliedSink = null;
  return toneContext;
}

async function applySink(ctx: AudioContext): Promise<void> {
  const sink = getVoiceDeviceIds().outputDeviceId || "";
  if (sink === appliedSink) {
    return;
  }
  const anyCtx = ctx as AudioCtxWithSink;
  if (typeof anyCtx.setSinkId !== "function") {
    return;
  }
  try {
    await anyCtx.setSinkId(sink);
    appliedSink = sink;
  } catch {
    /* устройство недоступно */
  }
}

async function playTone(fromHz: number, toHz: number): Promise<void> {
  if (isLocalUserDeafened()) {
    return;
  }
  const ctx = ensureToneContext();
  if (!ctx) {
    return;
  }
  await applySink(ctx);
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  const level = Math.min(1, PLAYBACK_VOLUME * volumeToGain(getOutputVolume())) * TONE_LEVEL;
  if (level <= 0) {
    return;
  }
  const now = ctx.currentTime;
  const end = now + TONE_SECONDS;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(fromHz, now);
  osc.frequency.linearRampToValueAtTime(toHz, end);
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(level, now + ATTACK_SECONDS);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
  osc.start(now);
  osc.stop(end + 0.01);
}

function safePlay(fromHz: number, toHz: number): void {
  playTone(fromHz, toHz).catch(() => {
    /* сбой звука не должен влиять на голос */
  });
}

/** Клавиша рации зажата — короткий восходящий тон, слышен только локально. */
export function playPttStartSound(): void {
  safePlay(660, 880);
}

/** Клавиша рации отпущена — короткий нисходящий тон, слышен только локально. */
export function playPttStopSound(): void {
  safePlay(880, 520);
}

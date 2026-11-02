import { connectMicChain, micProcessingConstraints } from './voice-mic-chain';

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    throw new Error('no_audio_context');
  }
  return new Ctx();
}

async function openPreviewMic(deviceId: string): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) {
    throw new Error('no_media_devices');
  }
  const processing = micProcessingConstraints();
  if (!deviceId) {
    return md.getUserMedia({ audio: processing, video: false });
  }
  try {
    return await md.getUserMedia({
      audio: { ...processing, deviceId: { exact: deviceId } },
      video: false,
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return md.getUserMedia({
        audio: { ...processing, deviceId: { ideal: deviceId } },
        video: false,
      });
    }
    throw error;
  }
}

/** Тихий граф, чтобы шкала чувствительности видела микрофон вне голосового канала. */
export async function startSensitivityPreview(deviceId: string): Promise<{ stop: () => void }> {
  const context = createAudioContext();
  void context.resume();
  const stream = await openPreviewMic(deviceId);
  const source = context.createMediaStreamSource(stream);
  const silent = context.createGain();
  silent.gain.value = 0;
  const chain = connectMicChain(context, source, silent);
  chain.output.connect(context.destination);
  return {
    stop() {
      chain.stop();
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
      for (const track of stream.getTracks()) {
        track.stop();
      }
      void context.close();
    },
  };
}

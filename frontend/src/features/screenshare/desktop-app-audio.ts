import appAudioProcessorUrl from "./app-audio-processor.js?url&no-inline";

/**
 * Звук демонстрации в десктопе (Windows): main запускает хелпер WASAPI process loopback и шлёт PCM по IPC,
 * здесь из него собирается дорожка. Окно — звук только этого приложения, весь экран — всё, кроме Hooba.
 * null — десктоп старый, не Windows или хелпер не запустился (Windows старше 10 2004, нет устройства вывода).
 */
export async function startDesktopAppAudio(sourceId: string): Promise<MediaStreamTrack | null> {
  const bridge = window.hoobaDesktop;
  if (!bridge?.startAppAudio || !bridge.stopAppAudio || !bridge.onAppAudioData) {
    return null;
  }
  let context: AudioContext | null = null;
  let node: AudioWorkletNode;
  let destination: MediaStreamAudioDestinationNode;
  try {
    context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    await context.audioWorklet.addModule(appAudioProcessorUrl);
    node = new AudioWorkletNode(context, "hooba-app-audio", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    destination = context.createMediaStreamDestination();
    destination.channelCount = 2;
    node.connect(destination);
    await context.resume();
  } catch (error) {
    console.warn("[screen] app audio graph failed", error);
    void context?.close();
    return null;
  }

  const started = await bridge.startAppAudio(sourceId).catch((error: unknown) => {
    console.warn("[screen] app audio start failed", error);
    return null;
  });
  if (!started?.ok || started.sampleRate !== context.sampleRate || started.channels !== 2) {
    if (started && !started.ok) {
      console.warn("[screen] app audio unavailable:", started.reason);
    } else if (started?.ok) {
      void bridge.stopAppAudio(started.id);
    }
    node.disconnect();
    void context.close();
    return null;
  }

  const id = started.id;
  const unsubscribeData = bridge.onAppAudioData((chunkId, bytes) => {
    if (chunkId !== id) {
      return;
    }
    // Свой буфер с выравниванием под float32 — и его можно отдать worklet без копии.
    const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    node.port.postMessage(samples, [samples.buffer]);
  });
  const unsubscribeEnded = bridge.onAppAudioEnded?.((endedId) => {
    if (endedId === id) {
      console.warn("[screen] app audio helper exited");
    }
  });

  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    unsubscribeData();
    unsubscribeEnded?.();
    void bridge.stopAppAudio(id);
    node.disconnect();
    void context.close();
    return null;
  }

  let released = false;
  const release = () => {
    if (released) {
      return;
    }
    released = true;
    unsubscribeData();
    unsubscribeEnded?.();
    void bridge.stopAppAudio?.(id);
    node.disconnect();
    void context?.close();
  };
  // Дорожку останавливают и показ, и producer mediasoup — захват должен закончиться вместе с ней.
  const nativeStop = track.stop.bind(track);
  track.stop = () => {
    nativeStop();
    release();
  };
  return track;
}

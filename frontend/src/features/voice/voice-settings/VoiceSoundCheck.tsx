import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getVoiceActivationMode,
  subscribeVoiceActivation,
} from "@/shared/lib/voice-activation-prefs";
import { Alert, Button, Meter, SectionLabel } from "@/shared/ui";
import { getVoiceMediasoupHandle } from "./voice-settings";
import {
  micCheckErrorMessage,
  playSpeakerCheck,
  startMicCheck,
  stopSpeakerCheck,
  type MicCheckHandle,
} from "./voice-sound-check";

function holdChannelMic(held: boolean) {
  const handle = getVoiceMediasoupHandle();
  if (!handle || typeof handle.setMicCheckHold !== "function") {
    return;
  }
  handle.setMicCheckHold(held);
}

export function VoiceSoundCheck({
  inputDeviceId,
  outputDeviceId,
  inputGain,
  outputGain,
  captureMode,
  micDisabled,
}: {
  inputDeviceId: string;
  outputDeviceId: string;
  inputGain: number;
  outputGain: number;
  captureMode: string;
  micDisabled: boolean;
}) {
  const activationMode = useSyncExternalStore(
    subscribeVoiceActivation,
    getVoiceActivationMode,
    () => "vad" as const,
  );
  const [micOn, setMicOn] = useState(false);
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [speakerBusy, setSpeakerBusy] = useState(false);
  const [speakerNote, setSpeakerNote] = useState<string | null>(null);
  const handleRef = useRef<MicCheckHandle | null>(null);
  const micOnRef = useRef(false);
  const generationRef = useRef(0);
  const settingsRef = useRef({
    inputDeviceId,
    outputDeviceId,
    inputGain,
    outputGain,
    captureMode,
  });

  useEffect(() => {
    settingsRef.current = {
      inputDeviceId,
      outputDeviceId,
      inputGain,
      outputGain,
      captureMode,
    };
  }, [inputDeviceId, outputDeviceId, inputGain, outputGain, captureMode]);

  function releaseMic() {
    holdChannelMic(false);
    handleRef.current?.stop();
    handleRef.current = null;
    micOnRef.current = false;
    setMicOn(false);
    setLevel(0);
  }

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      handleRef.current?.stop();
      handleRef.current = null;
      stopSpeakerCheck();
      holdChannelMic(false);
    };
  }, []);

  useEffect(() => {
    if (!micOn) {
      holdChannelMic(false);
      return;
    }
    holdChannelMic(true);
    return () => {
      holdChannelMic(false);
    };
  }, [micOn]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) {
      return;
    }
    handle.setInputGain(inputGain);
    handle.setOutputGain(outputGain);
    void handle.setSinkId(outputDeviceId);
  }, [inputGain, outputGain, outputDeviceId]);

  async function startCurrent(generation: number) {
    const current = settingsRef.current;
    const handle = await startMicCheck({
      deviceId: current.inputDeviceId,
      inputGain: current.inputGain,
      outputGain: current.outputGain,
      sinkId: current.outputDeviceId,
      onLevel: setLevel,
    });
    if (generation !== generationRef.current || !micOnRef.current) {
      handle.stop();
      return;
    }
    handleRef.current?.stop();
    handleRef.current = handle;
  }

  useEffect(() => {
    if (!micOnRef.current) {
      return;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    handleRef.current?.stop();
    handleRef.current = null;
    void startCurrent(generation).catch((error: unknown) => {
      if (generation !== generationRef.current) {
        return;
      }
      holdChannelMic(false);
      micOnRef.current = false;
      setMicOn(false);
      setLevel(0);
      setMicError(micCheckErrorMessage(error));
    });
  }, [inputDeviceId, captureMode, activationMode]);

  function toggleMic() {
    if (micOnRef.current) {
      generationRef.current += 1;
      releaseMic();
      return;
    }
    setMicError(null);
    micOnRef.current = true;
    setMicOn(true);
    holdChannelMic(true);
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    void startCurrent(generation).catch((error: unknown) => {
      if (generation !== generationRef.current) {
        return;
      }
      holdChannelMic(false);
      micOnRef.current = false;
      setMicOn(false);
      setLevel(0);
      setMicError(micCheckErrorMessage(error));
    });
  }

  async function onSpeaker() {
    if (speakerBusy) {
      return;
    }
    if (outputGain <= 0) {
      setSpeakerNote("Громкость динамиков стоит на 0%.");
      return;
    }
    setSpeakerNote(null);
    setSpeakerBusy(true);
    try {
      await playSpeakerCheck(outputDeviceId, outputGain);
    } catch {
      setSpeakerNote("Не удалось проиграть звук.");
    } finally {
      setSpeakerBusy(false);
    }
  }

  const meter = Math.round(Math.min(1, Math.max(0, level)) * 100);

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Проверка</SectionLabel>
      <div className="grid items-start gap-x-8 gap-y-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">Микрофон</span>
            <Button
              size="sm"
              variant={micOn ? "primary" : "secondary"}
              aria-pressed={micOn}
              isDisabled={micDisabled}
              onPress={() => {
                void toggleMic();
              }}
            >
              {micOn ? "Остановить" : "Проверить"}
            </Button>
          </div>
          <Meter value={meter} aria-label="Уровень микрофона" />
          <p className="text-xs text-muted">
            Если с выбранным микрофоном всё хорошо, то вы должны услышать свой прекрасный голос
          </p>
          {micError ? (
            <Alert tone="danger" compact>
              {micError}
            </Alert>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">Динамики</span>
            <Button
              size="sm"
              variant={speakerBusy ? "primary" : "secondary"}
              isDisabled={speakerBusy}
              onPress={() => {
                void onSpeaker();
              }}
            >
              {speakerBusy ? "Играет…" : "Проверить"}
            </Button>
          </div>
          <p className="text-xs text-muted">
            Если с устройством вывода звука всё хорошо, то вы услышите звуковой сигнал
          </p>
          {speakerNote ? (
            <Alert tone="danger" compact>
              {speakerNote}
            </Alert>
          ) : null}
        </div>
      </div>
    </section>
  );
}

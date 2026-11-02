import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isDesktopApp } from "@/shared/lib/server-target";
import {
  getPttBinding,
  setPttBinding,
  subscribeVoiceActivation,
  type VoiceActivationMode,
} from "@/shared/lib/voice-activation-prefs";
import {
  getManualSensitivity,
  isAutoSensitivityEnabled,
  setAutoSensitivityEnabled,
  setManualSensitivity,
  subscribeVoiceSensitivity,
  MANUAL_DEFAULT,
} from "@/shared/lib/voice-sensitivity-prefs";
import { Alert, Button, Kbd, KbdCombo, Radio, RadioGroup, SectionLabel, Slider, Switch } from "@/shared/ui";
import {
  beginPttCapture,
  cancelPttCapture,
  getPttHookError,
  subscribePttCapture,
  subscribePttHookError,
} from "./ptt-state";
import { getVoiceMediasoupHandle } from "./voice-settings/voice-settings";
import { startSensitivityPreview } from "./voice-input-preview";
import { getInputLevel, subscribeInputLevel } from "./voice-sensitivity";

function SensitivityFields({
  deviceId,
  active,
  captureMode,
  title,
}: {
  deviceId: string;
  active: boolean;
  captureMode: string;
  title: string;
}) {
  const auto = useSyncExternalStore(subscribeVoiceSensitivity, isAutoSensitivityEnabled, () => true);
  const manual = useSyncExternalStore(subscribeVoiceSensitivity, getManualSensitivity, () => 28);
  const level = useSyncExternalStore(subscribeInputLevel, getInputLevel, () => 0);

  useEffect(() => {
    if (!active || auto || getVoiceMediasoupHandle()) {
      return;
    }
    let cancelled = false;
    let stop = () => {};
    void startSensitivityPreview(deviceId)
      .then((preview) => {
        if (cancelled) {
          preview.stop();
          return;
        }
        stop = preview.stop;
      })
      .catch(() => {
        /* микрофон занят проверкой или звонком — шкала возьмёт уровень оттуда */
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [active, auto, deviceId, captureMode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{title}</p>
          <p className="text-xs text-muted">
            {auto
              ? "Hooba автоматически регулирует чувствительность вашего микрофона и определяет, когда вы говорите"
              : "Отрегулируйте вручную чувствительность вашего микрофона так, вы считаете нужным"}
          </p>
        </div>
        <Switch isSelected={auto} onChange={setAutoSensitivityEnabled} aria-label={title} className="shrink-0" />
      </div>
      {auto ? null : (
        <Slider
          aria-label="Чувствительность ввода"
          value={manual}
          onChange={setManualSensitivity}
          resetValue={MANUAL_DEFAULT}
          minValue={0}
          maxValue={100}
          marker={level}
          formatValue={false}
        />
      )}
    </div>
  );
}

function PttKeyBind() {
  const binding = useSyncExternalStore(subscribeVoiceActivation, getPttBinding, () => null);
  const hookError = useSyncExternalStore(subscribePttHookError, getPttHookError, () => null);
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);
  const setCapturingState = useCallback((next: boolean) => {
    capturingRef.current = next;
    setCapturing(next);
  }, []);

  useEffect(() => {
    return subscribePttCapture((event) => {
      if (event.type === "bind") {
        setPttBinding(event.binding);
      } else if (event.type === "clear") {
        setPttBinding(null);
      }
      setCapturingState(false);
    });
  }, [setCapturingState]);

  useEffect(() => {
    if (!capturing) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing]);

  useEffect(() => {
    return () => {
      if (capturingRef.current) {
        void cancelPttCapture();
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-2 pl-7">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-fg">Активировать по клавише</p>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            if (capturing) {
              void cancelPttCapture();
              setCapturingState(false);
              return;
            }
            void beginPttCapture().then(() => {
              if (!getPttHookError()) {
                setCapturingState(true);
              }
            });
          }}
        >
          {capturing ? (
            <Kbd recording>Нажмите клавишу…</Kbd>
          ) : binding ? (
            <span className="inline-flex items-center gap-2">
              Назначено на
              <KbdCombo keys={binding.label.split("+").map((part) => part.trim())} />
            </span>
          ) : (
            "Назначить"
          )}
        </Button>
      </div>
      {hookError ? (
        <Alert tone="danger" compact>
          {hookError}
        </Alert>
      ) : !binding && !capturing ? (
        <p className="text-xs text-muted">Пока клавиша не задана, микрофон молчит</p>
      ) : null}
    </div>
  );
}

export function InputSensitivityControl({
  deviceId,
  active,
  captureMode,
  activationMode,
  onActivationModeChange,
}: {
  deviceId: string;
  active: boolean;
  captureMode: string;
  activationMode: VoiceActivationMode;
  onActivationModeChange: (mode: VoiceActivationMode) => void;
}) {
  const desktop = isDesktopApp();

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Активация микрофона</SectionLabel>
      {desktop ? (
        <RadioGroup
          value={activationMode}
          onChange={(value) => onActivationModeChange(value as VoiceActivationMode)}
          aria-label="Активация микрофона"
        >
          <Radio value="vad">Автоматически определять, когда вы говорите</Radio>
          {activationMode === "vad" ? (
            <div className="pl-7">
              <SensitivityFields
                deviceId={deviceId}
                active={active}
                captureMode={captureMode}
                title="Автоматически определять чувствительность микрофона"
              />
            </div>
          ) : null}
          <Radio value="ptt">Режим рации (активация по клавише)</Radio>
          {activationMode === "ptt" ? <PttKeyBind /> : null}
        </RadioGroup>
      ) : (
        <SensitivityFields
          deviceId={deviceId}
          active={active}
          captureMode={captureMode}
          title="Автоматически определять чувствительность ввода"
        />
      )}
    </section>
  );
}

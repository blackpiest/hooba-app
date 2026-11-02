import { useEffect } from "react";
import { installPttBridge, syncDesktopPushToTalk } from "@/features/voice/ptt-state";
import {
  getVoiceMediasoupHandle,
  syncVoiceSettingsFromActiveSession,
  useVoiceSettingsStore,
} from "./voice-settings";
import { VoiceSettingsModal } from "./VoiceSettingsModal";

async function copyIncidentReport(text: string): Promise<boolean> {
  const writeClipboard = window.hoobaDesktop?.writeClipboard;
  if (writeClipboard) {
    return writeClipboard(text);
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* запасной путь, если Clipboard API недоступен */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  return copied;
}

/**
 * Провайдер: монтируется в AppShellLayout, держит модалку и init устройств.
 */
export function VoiceSettingsProvider({ onLogout }: { onLogout: () => void }) {
  const isOpen = useVoiceSettingsStore((s) => s.isOpen);
  const setOpen = useVoiceSettingsStore((s) => s.setOpen);
  const inputDeviceId = useVoiceSettingsStore((s) => s.inputDeviceId);
  const outputDeviceId = useVoiceSettingsStore((s) => s.outputDeviceId);
  const audioInputDevices = useVoiceSettingsStore((s) => s.audioInputDevices);
  const audioOutputDevices = useVoiceSettingsStore((s) => s.audioOutputDevices);
  const mediaDebug = useVoiceSettingsStore((s) => s.mediaDebug);
  const hideDebug = useVoiceSettingsStore((s) => s.hideDebug);
  const deviceError = useVoiceSettingsStore((s) => s.deviceError);
  const inputVolume = useVoiceSettingsStore((s) => s.inputVolume);
  const outputVolume = useVoiceSettingsStore((s) => s.outputVolume);
  const captureMode = useVoiceSettingsStore((s) => s.captureMode);
  const activationMode = useVoiceSettingsStore((s) => s.activationMode);
  const setInputDeviceId = useVoiceSettingsStore((s) => s.setInputDeviceId);
  const setOutputDeviceId = useVoiceSettingsStore((s) => s.setOutputDeviceId);
  const setInputVolume = useVoiceSettingsStore((s) => s.setInputVolume);
  const setOutputVolume = useVoiceSettingsStore((s) => s.setOutputVolume);
  const setCaptureMode = useVoiceSettingsStore((s) => s.setCaptureMode);
  const setActivationMode = useVoiceSettingsStore((s) => s.setActivationMode);

  useEffect(() => {
    installPttBridge();
    useVoiceSettingsStore.getState().hydrateFromStorage();
    void syncDesktopPushToTalk();
    void useVoiceSettingsStore.getState().refreshDevices();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    syncVoiceSettingsFromActiveSession();
  }, [isOpen]);

  useEffect(() => {
    const md =
      typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    const onDev = () => {
      void useVoiceSettingsStore.getState().refreshDevices();
    };
    md?.addEventListener?.("devicechange", onDev);
    return () => {
      md?.removeEventListener?.("devicechange", onDev);
    };
  }, []);

  return (
    <VoiceSettingsModal
      isOpen={isOpen}
      onOpenChange={setOpen}
      voiceInputId={inputDeviceId}
      voiceOutputId={outputDeviceId}
      audioInputDevices={audioInputDevices}
      audioOutputDevices={audioOutputDevices}
      voiceMediaDbg={mediaDebug}
      hideDebug={hideDebug}
      deviceError={deviceError}
      onInputChange={setInputDeviceId}
      onOutputChange={setOutputDeviceId}
      inputVolume={inputVolume}
      outputVolume={outputVolume}
      captureMode={captureMode}
      activationMode={activationMode}
      onInputVolume={setInputVolume}
      onOutputVolume={setOutputVolume}
      onCaptureModeChange={setCaptureMode}
      onActivationModeChange={setActivationMode}
      onRefreshDevices={() =>
        void useVoiceSettingsStore.getState().refreshDevices()
      }
      onCopyIncidentReport={async () => {
        const text = getVoiceMediasoupHandle()?.getIncidentReport();
        if (!text) {
          throw new Error("no voice session");
        }
        if (await copyIncidentReport(text)) {
          return;
        }
        throw new Error("copy failed");
      }}
      onLogout={onLogout}
    />
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Heading } from "react-aria-components";
import {
  setGameActivityEnabled,
  useGameActivityEnabled,
} from "@/features/presence/game-activity-prefs";
import { isDesktopApp } from "@/shared/lib/server-target";
import {
  setChatNotificationSoundsEnabled,
  useChatNotificationSoundsEnabled,
} from "@/features/chat/chat-notification-prefs";
import {
  setGameToastsEnabled,
  setMessageToastsEnabled,
  useGameToastsEnabled,
  useMessageToastsEnabled,
} from "@/features/desktop-toasts/toast-prefs";
import {
  setVoiceOverlayEnabled,
  setVoiceOverlayOnlyInGame,
  useVoiceOverlayEnabled,
  useVoiceOverlayOnlyInGame,
} from "@/shared/lib/voice-overlay";
import type { VoiceMediaDebug } from "../webrtc-voice.types";
import { InputSensitivityControl } from "@/features/voice/InputSensitivityControl";
import { VolumeSlider } from "@/features/voice/VolumeSlider";
import { VoiceSoundCheck } from "@/features/voice/voice-settings/VoiceSoundCheck";
import type { VoiceActivationMode } from "@/shared/lib/voice-activation-prefs";
import type { VoiceCaptureMode } from "@/shared/lib/voice-processing-prefs";
import {
  Alert,
  Button,
  ConfirmDialog,
  IconButton,
  ListItem,
  Modal,
  Radio,
  RadioGroup,
  SectionLabel,
  Select,
  SettingRow,
  Switch,
} from "@/shared/ui";
import type { IconName } from "@/shared/ui";

/** Пустая строка (устройство по умолчанию) не годится как ключ списка — подменяем. */
const DEFAULT_DEVICE_KEY = "__default__";

function DeviceSelect({
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  options: { label: string; value: string }[];
  onChange: (deviceId: string) => void;
}) {
  return (
    <Select
      label={label}
      value={value === "" ? DEFAULT_DEVICE_KEY : value}
      onChange={(key) => onChange(key === DEFAULT_DEVICE_KEY ? "" : key)}
      isDisabled={disabled}
      options={options.map((option) => ({
        value: option.value === "" ? DEFAULT_DEVICE_KEY : option.value,
        label: option.label,
      }))}
    />
  );
}

function mediaDevicesAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices;
}

function deviceOptions(
  devices: MediaDeviceInfo[],
  defaultLabel: string,
  fallbackPrefix: string
): { label: string; value: string }[] {
  return [
    { label: defaultLabel, value: "" },
    ...devices.map((d) => ({
      label: d.label || `${fallbackPrefix} ${d.deviceId.slice(0, 8)}…`,
      value: d.deviceId,
    })),
  ];
}

function Code({ children }: { children: string }) {
  return <code className="border border-line bg-bg px-1 font-label text-xs text-fg">{children}</code>;
}

function VoiceHttpsWarning() {
  return (
    <Alert tone="warning" title="Список микрофонов недоступен">
      Страница открыта по <b className="text-fg">http://IP</b> без HTTPS — в браузере нет <Code>navigator.mediaDevices</Code>{" "}
      (нужен localhost или TLS). Голос с микрофоном здесь не заработает; для LAN добавьте в <Code>backend/.env</Code> ваш
      origin в <Code>FRONTEND_ORIGIN</Code> и в <Code>frontend/.env</Code> — <Code>VITE_WS_URL=ws://IP:3000</Code> (см.
      .env.example).
    </Alert>
  );
}

function formatDebugCount(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function formatDebugLevel(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function VoiceDebugPanel({
  debug,
  onCopyReport,
}: {
  debug: VoiceMediaDebug;
  onCopyReport: () => Promise<void>;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copyTimer = useRef<number | null>(null);
  const copyLabel =
    copyState === "copied" ? "Скопировано" : copyState === "error" ? "Не удалось скопировать" : "Скопировать отчёт";

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }
    };
  }, []);

  const markCopy = (next: "copied" | "error") => {
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
    }
    setCopyState(next);
    copyTimer.current = window.setTimeout(() => {
      copyTimer.current = null;
      setCopyState("idle");
    }, 2000);
  };

  return (
    <div className="ds-selectable border border-line bg-bg px-3 py-2.5 font-label text-xs leading-relaxed text-muted">
      <div>
        WebRTC transport: send={debug.sendConn} recv={debug.recvConn}
      </div>
      <div className="mt-1">
        ICE send={debug.sendIce ?? "n/a"} recv={debug.recvIce ?? "n/a"} · bytesSent2s=
        {formatDebugCount(debug.bytesSent2s)}
      </div>
      <div className="mt-1">
        Локальный микрофон: track muted={String(debug.localMicMuted)}
        {debug.localMicMuted ? " (нет данных с устройства)" : ""} · {debug.localMicReady} ·
        producer paused={String(debug.localProducerPaused)} · id{" "}
        {debug.localProducerId ? `${debug.localProducerId.slice(0, 8)}…` : "—"}
      </div>
      {debug.remote.length === 0 ? (
        <div className="mt-1 text-disabled-text">Удалённых аудиопотоков пока нет (один в комнате).</div>
      ) : (
        debug.remote.map((r, index) => (
          <div key={r.producerId} className="mt-1">
            remote {r.producerId.slice(0, 8)}… · client consumer paused=
            {String(r.consumerPaused)} · track muted={String(r.trackMuted)}
            {r.trackMuted ? " (нет RTP)" : ""} · elPaused=
            {String(debug.audioPaused[index] ?? false)} · {r.trackReady} · bytesReceived2s=
            {formatDebugCount(r.bytesReceived2s)} · audioLevel={formatDebugLevel(r.audioLevel)} ·
            signalSpeaking={String(r.signalSpeaking)}
          </div>
        ))
      )}
      <div className="mt-1 text-disabled-text">
        muted — флаг WebRTC, не кнопка микрофона. muted=false и растущие байты значат, что RTP
        идёт. audioLevel — энергия в этих пакетах. elPaused=true — локальный плеер не запущен.
        bytesSent2s и bytesReceived2s — n/a, пока нет второго замера (~2 с).
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        onPress={() => {
          void onCopyReport()
            .then(() => {
              markCopy("copied");
            })
            .catch(() => {
              markCopy("error");
            });
        }}
      >
        {copyLabel}
      </Button>
    </div>
  );
}

type SettingsSection = "voice" | "notifications" | "overlay" | "activity" | "system";

const SECTION_TITLE: Record<SettingsSection, string> = {
  voice: "Настройки звука",
  notifications: "Уведомления",
  overlay: "Оверлей",
  activity: "Игровая активность",
  system: "Система",
};

const SECTION_ICON: Record<SettingsSection, IconName> = {
  voice: "mic",
  notifications: "bell",
  overlay: "screen",
  activity: "gamepad",
  system: "settings",
};

function NotificationSettings() {
  const enabled = useChatNotificationSoundsEnabled();
  const messageToasts = useMessageToastsEnabled();
  const gameToasts = useGameToastsEnabled();
  const desktop = isDesktopApp();

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <SettingRow
        title="Звуковые уведомления"
        description="Проигрывать звуковое оповещение при получении нового сообщения в чатах"
      >
        <Switch aria-label="Звуковые уведомления" isSelected={enabled} onChange={setChatNotificationSoundsEnabled} />
      </SettingRow>
      {desktop ? (
        <SettingRow
          title="Всплывающие уведомления о сообщениях"
          description="Показывать новое сообщение в углу экрана, когда окно Hooba не в фокусе"
        >
          <Switch
            aria-label="Всплывающие уведомления о сообщениях"
            isSelected={messageToasts}
            onChange={setMessageToastsEnabled}
          />
        </SettingRow>
      ) : null}
      {desktop ? (
        <SettingRow
          title="Уведомлять, когда участники начинают играть"
          description="Всплывающее уведомление, когда кто-то запускает игру. Про одного человека — не чаще раза в 15 минут"
        >
          <Switch
            aria-label="Уведомлять, когда участники начинают играть"
            isSelected={gameToasts}
            onChange={setGameToastsEnabled}
          />
        </SettingRow>
      ) : null}
    </section>
  );
}

function canDetectGames(): boolean {
  return isDesktopApp() && window.hoobaDesktop?.platform === "win32";
}

function GameActivitySettings() {
  const enabled = useGameActivityEnabled();
  const detectable = canDetectGames();

  return (
    <section className="flex max-w-xl flex-col gap-4">
      {detectable ? (
        <SettingRow title="Показывать, во что я играю" description="Отображение в своём статусе названия запущенной игры">
          <Switch aria-label="Показывать, во что я играю" isSelected={enabled} onChange={setGameActivityEnabled} />
        </SettingRow>
      ) : (
        <Alert tone="info" compact>
          Определение запущенной игры есть только в десктопном приложении для Windows.
        </Alert>
      )}
    </section>
  );
}

function SystemSettings() {
  const desktop = isDesktopApp();
  const [enabled, setEnabled] = useState(true);
  const [known, setKnown] = useState(false);

  useEffect(() => {
    if (!desktop) {
      return;
    }
    let cancelled = false;
    void window.hoobaDesktop?.getOpenAtLogin?.().then((next) => {
      if (!cancelled && typeof next === "boolean") {
        setEnabled(next);
        setKnown(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <SettingRow title="Запускать при старте системы" description="При входе в систему приложение запускается в трее">
        <Switch
          aria-label="Запускать при старте системы"
          isSelected={enabled}
          isDisabled={!known}
          onChange={(next) => {
            setEnabled(next);
            void window.hoobaDesktop?.setOpenAtLogin?.(next).then((stored) => {
              if (typeof stored === "boolean") {
                setEnabled(stored);
              }
            });
          }}
        />
      </SettingRow>
    </section>
  );
}

function OverlaySettings() {
  const enabled = useVoiceOverlayEnabled();
  const onlyInGame = useVoiceOverlayOnlyInGame();

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-muted">
        Отображение списка участников активного голосового канала в левой части экрана поверх всех окон. Оверлей работает, если игра запущена в окне или в режиме "Окно на весь экран"
      </p>
      <SettingRow title="Показывать оверлей" description="Пока вы в голосовом канале">
        <Switch aria-label="Показывать оверлей" isSelected={enabled} onChange={setVoiceOverlayEnabled} />
      </SettingRow>
      <SettingRow title="Отображать, только если запущена игра" description="Оверлей отобразиться, если Hooba найдёт запущенный процесс знакомой игры">
        <Switch
          aria-label="Отображать, только если запущена игра"
          isSelected={onlyInGame}
          isDisabled={!enabled}
          onChange={setVoiceOverlayOnlyInGame}
        />
      </SettingRow>
    </section>
  );
}

export type VoiceSettingsModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  voiceInputId: string;
  voiceOutputId: string;
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  voiceMediaDbg: VoiceMediaDebug | null;
  /** Скрыть блок отладки (например, при критической ошибке SFU). */
  hideDebug?: boolean;
  deviceError?: string | null;
  onInputChange: (deviceId: string) => void;
  onOutputChange: (deviceId: string) => void;
  inputVolume: number;
  outputVolume: number;
  captureMode: VoiceCaptureMode;
  activationMode: VoiceActivationMode;
  onInputVolume: (percent: number) => void;
  onOutputVolume: (percent: number) => void;
  onCaptureModeChange: (mode: VoiceCaptureMode) => void;
  onActivationModeChange: (mode: VoiceActivationMode) => void;
  onRefreshDevices: () => void;
  onCopyIncidentReport: () => Promise<void>;
  onLogout: () => void;
};

export function VoiceSettingsModal({
  isOpen,
  onOpenChange,
  voiceInputId,
  voiceOutputId,
  audioInputDevices,
  audioOutputDevices,
  voiceMediaDbg,
  hideDebug = false,
  deviceError = null,
  onInputChange,
  onOutputChange,
  inputVolume,
  outputVolume,
  captureMode,
  activationMode,
  onInputVolume,
  onOutputVolume,
  onCaptureModeChange,
  onActivationModeChange,
  onRefreshDevices,
  onCopyIncidentReport,
  onLogout,
}: VoiceSettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>("voice");
  /** Узкий экран: сначала список разделов, раздел открывается поверх него. */
  const [mobileMenu, setMobileMenu] = useState(true);
  const [debugExpanded, setDebugExpanded] = useState(true);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const desktop = isDesktopApp();

  useEffect(() => {
    if (isOpen) {
      setSection("voice");
      setMobileMenu(true);
    }
  }, [isOpen]);

  const canUseMediaDevices = mediaDevicesAvailable();

  const inputOptions = useMemo(
    () => deviceOptions(audioInputDevices, "По умолчанию системы", "Микрофон"),
    [audioInputDevices]
  );

  const outputOptions = useMemo(
    () => deviceOptions(audioOutputDevices, "По умолчанию системы", "Выход"),
    [audioOutputDevices]
  );

  const showDebugSection = !hideDebug && voiceMediaDbg != null;

  const sections: SettingsSection[] = desktop
    ? ["voice", "notifications", "overlay", "activity", "system"]
    : ["voice", "notifications"];

  return (
    <>
      <Modal
        bare
        size="2xl"
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        title="Настройки"
      >
        <div className="flex h-[min(80dvh,720px)] w-full max-md:h-full">
          <aside
            className={`${mobileMenu ? "flex" : "hidden"} w-full shrink-0 flex-col bg-surface md:flex md:w-[232px] md:border-r md:border-line`}
          >
            <div className="flex items-center justify-between gap-3 pr-2 md:block md:pr-0">
              <Heading slot="title" className="px-4 pb-3 pt-5 font-heading text-lg tracking-tight">
                Настройки
              </Heading>
              <IconButton
                icon="close"
                label="Закрыть"
                onPress={() => onOpenChange(false)}
                className="mt-2 md:hidden"
              />
            </div>
            <nav className="flex flex-col gap-0.5 px-2" aria-label="Разделы настроек">
              {sections.map((id) => (
                <ListItem
                  key={id}
                  icon={SECTION_ICON[id]}
                  active={section === id}
                  onPress={() => {
                    setSection(id);
                    setMobileMenu(false);
                  }}
                >
                  {SECTION_TITLE[id]}
                </ListItem>
              ))}
            </nav>
            <div className="mt-auto border-t border-line p-2">
              <Button variant="danger-ghost" leadingIcon="logout" fullWidth onPress={() => setLogoutOpen(true)}>
                Выйти из аккаунта
              </Button>
            </div>
          </aside>

          <div className={`${mobileMenu ? "hidden" : "flex"} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
            <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-5 md:px-6">
              <IconButton
                icon="arrow-left"
                label="К разделам настроек"
                onPress={() => setMobileMenu(true)}
                className="-mr-1 md:hidden"
              />
              <h2 className="min-w-0 flex-1 font-heading text-xl tracking-tight">{SECTION_TITLE[section]}</h2>
              <IconButton icon="close" label="Закрыть" onPress={() => onOpenChange(false)} />
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 md:px-6">
              {section === "notifications" ? <NotificationSettings /> : null}
              {section === "overlay" ? <OverlaySettings /> : null}
              {section === "activity" ? <GameActivitySettings /> : null}
              {section === "system" ? <SystemSettings /> : null}
              {section === "voice" && !canUseMediaDevices ? <VoiceHttpsWarning /> : null}
              {section === "voice" && deviceError ? (
                <Alert tone="danger" compact>
                  {deviceError}
                </Alert>
              ) : null}

              {section === "voice" ? (
                <>
                  <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <SectionLabel>Устройства</SectionLabel>
                      <Button
                        variant="ghost"
                        size="sm"
                        leadingIcon="refresh"
                        isDisabled={!canUseMediaDevices}
                        onPress={() => onRefreshDevices()}
                      >
                        Обновить список
                      </Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <DeviceSelect
                        label="Микрофон"
                        value={voiceInputId}
                        disabled={!canUseMediaDevices}
                        options={inputOptions}
                        onChange={onInputChange}
                      />
                      <DeviceSelect
                        label="Вывод звука"
                        value={voiceOutputId}
                        disabled={!canUseMediaDevices}
                        options={outputOptions}
                        onChange={onOutputChange}
                      />
                    </div>

                    {audioOutputDevices.length === 0 && canUseMediaDevices ? (
                      <p className="text-xs text-muted">
                        Список выходов пуст: в Firefox часто нет выбора динамика; в Chrome/Edge доступен setSinkId для
                        удалённых участников.
                      </p>
                    ) : null}
                  </section>

                  <section className="flex flex-col gap-4">
                    <SectionLabel>Громкость</SectionLabel>
                    <VolumeSlider label="Микрофон" value={inputVolume} onChange={onInputVolume} />
                    <VolumeSlider label="Динамики" value={outputVolume} onChange={onOutputVolume} />
                  </section>

                  <VoiceSoundCheck
                    inputDeviceId={voiceInputId}
                    outputDeviceId={voiceOutputId}
                    inputGain={inputVolume / 100}
                    outputGain={outputVolume / 100}
                    captureMode={captureMode}
                    micDisabled={!canUseMediaDevices}
                  />

                  <InputSensitivityControl
                    deviceId={voiceInputId}
                    active={isOpen && canUseMediaDevices}
                    captureMode={captureMode}
                    activationMode={activationMode}
                    onActivationModeChange={onActivationModeChange}
                  />

                  <section className="flex flex-col gap-3">
                    <SectionLabel>Обработка</SectionLabel>
                    <RadioGroup
                      value={captureMode}
                      onChange={(value) => onCaptureModeChange(value as VoiceCaptureMode)}
                      aria-label="Обработка микрофона"
                    >
                      <Radio value="suppress" description="Убирает эхо и фоновый шум">
                        Шумоподавление
                      </Radio>
                      <Radio value="off" description="Микрофон передаётся как есть">
                        Без обработки
                      </Radio>
                    </RadioGroup>
                  </section>

                  {showDebugSection ? (
                    <section className="flex flex-col gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        fullWidth
                        className="justify-between font-label text-[10px] uppercase tracking-[0.1em]"
                        aria-expanded={debugExpanded}
                        trailingIcon={debugExpanded ? "chevron-up" : "chevron-down"}
                        onPress={() => setDebugExpanded((v) => !v)}
                      >
                        Отладка WebRTC
                      </Button>
                      {debugExpanded ? (
                        <VoiceDebugPanel debug={voiceMediaDbg} onCopyReport={onCopyIncidentReport} />
                      ) : null}
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutBusy(true);
          onLogout();
        }}
        tone="danger"
        title="Выход"
        description="Вы действительно хотите выйти из аккаунта?"
        confirmLabel="Подтвердить"
        isPending={logoutBusy}
      />
    </>
  );
}

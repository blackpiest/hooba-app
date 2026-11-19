import { useEffect, useState } from "react";
import { Button, SettingRow } from "@/shared/ui";
import type { DesktopUpdateCheckResult, DesktopUpdateState } from "@/shared/lib/server-target";

const idle: DesktopUpdateState = { phase: "idle", version: "", percent: 0 };

function checkMessage(result: DesktopUpdateCheckResult): string {
  switch (result.status) {
    case "current":
      return "Установлена последняя версия";
    case "unavailable":
      return "Проверка обновлений доступна в установленной версии";
    case "error":
      return "Не удалось проверить обновления";
    default:
      return "";
  }
}

/** Раздел «Система» в десктопе: текущая версия, ручная проверка и установка обновления. */
export function DesktopVersionSettings() {
  const version = window.hoobaDesktop?.version ?? "";
  const canCheck = typeof window.hoobaDesktop?.checkUpdates === "function";
  const [state, setState] = useState<DesktopUpdateState>(idle);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DesktopUpdateCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.hoobaDesktop?.updateState?.().then((next) => {
      if (!cancelled && next) {
        setState(next);
      }
    });
    const unsubscribe = window.hoobaDesktop?.onUpdateState?.(setState);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const next = await window.hoobaDesktop?.checkUpdates?.();
      setResult(next ?? { status: "error", version });
    } catch {
      setResult({ status: "error", version });
    } finally {
      setChecking(false);
    }
  };

  // Найденное обновление ведёт себя как плашка сверху: скачать → перезапустить.
  const pending = state.phase !== "idle";
  const status = pending
    ? state.phase === "downloading"
      ? `Загрузка версии ${state.version}: ${state.percent}%`
      : state.phase === "ready"
        ? `Версия ${state.version} готова к установке`
        : state.phase === "error"
          ? `Не удалось скачать версию ${state.version}`
          : `Доступна версия ${state.version}`
    : result
      ? checkMessage(result)
      : "Обновления проверяются автоматически";

  return (
    <SettingRow
      title={version ? `Версия ${version}` : "Версия приложения"}
      description={status}
    >
      {pending ? (
        <Button
          size="sm"
          isDisabled={state.phase === "downloading"}
          onPress={() => {
            if (state.phase === "ready") {
              void window.hoobaDesktop?.installUpdate?.();
              return;
            }
            void window.hoobaDesktop?.downloadUpdate?.();
          }}
        >
          {state.phase === "ready" ? "Перезапустить" : state.phase === "error" ? "Повторить" : "Обновить"}
        </Button>
      ) : canCheck ? (
        <Button size="sm" variant="secondary" isPending={checking} onPress={() => void check()}>
          Проверить обновления
        </Button>
      ) : null}
    </SettingRow>
  );
}

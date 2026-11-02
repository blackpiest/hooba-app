import { useEffect } from "react";
import { fetchGameCatalog, type GameCatalogEntry } from "@/shared/api/game-activity";
import { isDesktopApp } from "@/shared/lib/server-target";
import { isRealtimeIdentified, sendPresenceActivity, subscribeRealtime } from "@/shared/ws/app-realtime";
import { useGameToastsEnabled, useMessageToastsEnabled } from "@/features/desktop-toasts/toast-prefs";
import { useGameActivityEnabled } from "./game-activity-prefs";
import { setSelfGameRunning } from "./self-game-running";

/** Каждый опрос — запуск процесса в main. Для статуса «играет в …» 15 с задержки незаметны. */
const POLL_MS = 15_000;
const CATALOG_REFRESH_MS = 30 * 60 * 1000;

function windowsDesktop(): boolean {
  return isDesktopApp() && window.hoobaDesktop?.platform === "win32";
}

/**
 * На Windows-десктопе сверяет процессы с каталогом и публикует название игры.
 * Опрос нужен и тостам (в игре — без сообщений), поэтому идёт, даже когда статус выключен: тогда игра не публикуется.
 */
export function useGameActivity(): void {
  const enabled = useGameActivityEnabled();
  const messageToasts = useMessageToastsEnabled();
  const gameToasts = useGameToastsEnabled();
  const detect = enabled || messageToasts || gameToasts;
  useEffect(() => {
    if (!windowsDesktop()) {
      return;
    }
    if (!enabled) {
      sendPresenceActivity(null);
    }
    if (!detect) {
      setSelfGameRunning(false);
      return;
    }

    let stopped = false;
    // Эффект перезапускается переключателем, когда `auth:success` уже прошёл: берём текущее состояние сокета.
    let authed = isRealtimeIdentified();
    let published: string | null | undefined;
    let running = false;
    let catalog: GameCatalogEntry[] = [];
    let catalogAt = 0;

    const publish = (next: string | null) => {
      setSelfGameRunning(next !== null);
      if (!enabled || !authed || next === published) {
        return;
      }
      sendPresenceActivity(next);
      published = next;
    };

    const ensureCatalog = async () => {
      if (catalog.length > 0 && Date.now() - catalogAt < CATALOG_REFRESH_MS) {
        return;
      }
      try {
        const next = await fetchGameCatalog();
        if (stopped) {
          return;
        }
        if (next.length > 0) {
          catalog = next;
          catalogAt = Date.now();
        }
      } catch {
        /* остаётся предыдущий каталог */
      }
    };

    const tick = async () => {
      if (running || stopped) {
        return;
      }
      running = true;
      try {
        await ensureCatalog();
        if (stopped || catalog.length === 0) {
          return;
        }
        const match = window.hoobaDesktop?.matchRunningGame;
        if (!match) {
          return;
        }
        const title = await match(catalog);
        if (stopped) {
          return;
        }
        const next = typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : null;
        publish(next);
      } catch {
        /* ошибка опроса не сбрасывает текущую игру */
      } finally {
        running = false;
      }
    };

    const unsubscribe = subscribeRealtime((event, data) => {
      if (event === "connection:status" && data.state === "reconnecting") {
        authed = false;
        published = undefined;
        return;
      }
      if (event === "auth:success") {
        authed = true;
        published = undefined;
        void tick();
      }
    });

    void tick();
    const poll = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      stopped = true;
      unsubscribe();
      window.clearInterval(poll);
      setSelfGameRunning(false);
      if (published) {
        sendPresenceActivity(null);
      }
    };
  }, [enabled, detect]);
}

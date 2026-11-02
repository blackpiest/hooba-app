import { useEffect, useState } from "react";
import { fetchGameCatalog, type GameCatalogEntry } from "@/shared/api/game-activity";

/** Опрос — запуск процесса в main; для показа оверлея 5 с задержки незаметны. */
const POLL_MS = 5_000;
const CATALOG_REFRESH_MS = 30 * 60 * 1000;

/**
 * Запущена ли игра из каталога статусов (Windows-десктоп). Пока `active` false — не опрашивает.
 * Если каталог или опрос недоступны, возвращает true: оверлей не пропадает из-за сбоя.
 */
export function useGameRunning(active: boolean): boolean {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const match = window.hoobaDesktop?.matchRunningGame;
    if (!active) {
      setRunning(false);
      return;
    }
    if (!match) {
      setRunning(true);
      return;
    }

    let stopped = false;
    let busy = false;
    let catalog: GameCatalogEntry[] = [];
    let catalogAt = 0;

    const tick = async () => {
      if (busy || stopped) {
        return;
      }
      busy = true;
      try {
        if (catalog.length === 0 || Date.now() - catalogAt > CATALOG_REFRESH_MS) {
          const next = await fetchGameCatalog();
          if (next.length > 0) {
            catalog = next;
            catalogAt = Date.now();
          }
        }
        if (catalog.length === 0) {
          if (!stopped) {
            setRunning(true);
          }
          return;
        }
        const title = await match(catalog);
        if (!stopped) {
          setRunning(typeof title === "string" && title.trim() !== "");
        }
      } catch {
        if (!stopped) {
          setRunning(true);
        }
      } finally {
        busy = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [active]);

  return running;
}

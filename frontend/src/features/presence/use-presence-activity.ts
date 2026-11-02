import { useEffect } from "react";
import { sendPresenceAfk, subscribeRealtime } from "@/shared/ws/app-realtime";

const IDLE_MS = 1 * 60 * 1000;
const POLL_MS = 15_000;

/** Сообщает серверу afk: в вебе по вводу на странице, в десктопе — по простою ОС. */
export function usePresenceActivity(): void {
  useEffect(() => {
    let afk = false;
    let lastInput = Date.now();
    let stopped = false;
    let tickTimer: number | null = null;

    const publish = (next: boolean) => {
      if (next === afk) {
        return;
      }
      afk = next;
      sendPresenceAfk(afk);
    };

    const tick = async () => {
      let idleMs = Date.now() - lastInput;
      const readSystem = window.hoobaDesktop?.systemIdleMs;
      if (readSystem) {
        try {
          const systemMs = await readSystem();
          if (!stopped && typeof systemMs === "number" && Number.isFinite(systemMs)) {
            idleMs = systemMs;
          }
        } catch {
          /* системный простой недоступен — остаётся ввод в окне */
        }
      }
      if (!stopped) {
        publish(idleMs >= IDLE_MS);
      }
    };

    const scheduleTick = () => {
      if (tickTimer !== null) {
        return;
      }
      tickTimer = window.setTimeout(() => {
        tickTimer = null;
        void tick();
      }, 1000);
    };

    const onInput = () => {
      lastInput = Date.now();
      if (window.hoobaDesktop?.systemIdleMs) {
        scheduleTick();
        return;
      }
      publish(false);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };

    const unsubscribe = subscribeRealtime((event) => {
      if (event === "auth:success") {
        sendPresenceAfk(afk);
      }
    });

    const passive = { passive: true } as const;
    window.addEventListener("pointerdown", onInput, passive);
    window.addEventListener("pointermove", onInput, passive);
    window.addEventListener("keydown", onInput);
    window.addEventListener("touchstart", onInput, passive);
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      stopped = true;
      unsubscribe();
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("pointermove", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("touchstart", onInput);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
      if (tickTimer !== null) {
        window.clearTimeout(tickTimer);
      }
    };
  }, []);
}

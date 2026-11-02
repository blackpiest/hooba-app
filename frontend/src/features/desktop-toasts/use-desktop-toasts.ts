import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeRealtime } from "@/shared/ws/app-realtime";
import { usePresenceStore } from "@/stores/presence-store";
import { useUserStore } from "@/stores/user-store";
import { gameToastsEnabled } from "./toast-prefs";
import { memberToastIdentity, pushDesktopToast } from "./push-desktop-toast";

/** Не чаще раза в минуту на человека: перезапуск игры или вылет не спамят. */
const GAME_TOAST_COOLDOWN_MS = 60_000;
/** После (пере)подключения сервер заново рассылает активность — это не «начал играть». */
const RECONNECT_QUIET_MS = 10_000;

const lastGameByUserId = new Map<number, string>();
const lastToastAtByUserId = new Map<number, number>();
/** Значение игры в сторе до обновления внутри текущего события: общая подписка оболочки может сработать раньше этой. */
const storeGameBefore = new Map<number, string | null>();
let quietUntil = 0;

function onGameActivity(userId: number, game: string | null): void {
  // Порядок подписок не гарантирован (хук перемонтируется после загрузки оболочки), поэтому стор мог обновиться раньше:
  // тогда прежнее значение берётся из storeGameBefore. Нужно для повторов: смена статуса
  // (например, выход из «невидимки») снова рассылает текущую игру.
  const previous =
    lastGameByUserId.get(userId) ??
    (storeGameBefore.has(userId) ? storeGameBefore.get(userId) : usePresenceStore.getState().gameByUserId[userId]) ??
    null;
  if (game === null) {
    lastGameByUserId.delete(userId);
    return;
  }
  lastGameByUserId.set(userId, game);
  if (previous === game || Date.now() < quietUntil || !gameToastsEnabled()) {
    return;
  }
  if (userId === useUserStore.getState().me?.id) {
    return;
  }
  const shownAt = lastToastAtByUserId.get(userId);
  if (shownAt !== undefined && Date.now() - shownAt < GAME_TOAST_COOLDOWN_MS) {
    return;
  }
  const member = memberToastIdentity(userId, "");
  if (member.name.length === 0) {
    return;
  }
  // Кулдаун тратится, только если тост реально показан: отброшенный (окно в фокусе, «Не беспокоить») его не съедает.
  const shown = pushDesktopToast({
    kind: "game",
    title: member.name,
    body: game,
    meta: "Начинает играть",
    avatar: member.avatar,
    channelId: null,
  });
  if (shown) {
    lastToastAtByUserId.set(userId, Date.now());
  }
}

/** Десктоп: тосты «начал играть» и переход в канал по клику на тост сообщения. */
export function useDesktopToasts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    return window.hoobaDesktop?.onToastOpen?.((target) => {
      if (Number.isInteger(target?.channelId) && target.channelId > 0) {
        navigate(`/app/channels/${target.channelId}`);
      }
    });
  }, [navigate]);

  useEffect(() => {
    quietUntil = Date.now() + RECONNECT_QUIET_MS;
    const unsubscribeStore = usePresenceStore.subscribe((state, prev) => {
      for (const key of Object.keys(state.gameByUserId)) {
        const userId = Number(key);
        if (state.gameByUserId[userId] !== prev.gameByUserId[userId] && !storeGameBefore.has(userId)) {
          storeGameBefore.set(userId, prev.gameByUserId[userId] ?? null);
        }
      }
      // Все слушатели одного WS-события отрабатывают синхронно, до микрозадачи.
      queueMicrotask(() => storeGameBefore.clear());
    });
    const unsubscribeRealtime = subscribeRealtime((event, data) => {
      if (event === "connection:status") {
        if (data.state === "online") {
          quietUntil = Date.now() + RECONNECT_QUIET_MS;
        }
        return;
      }
      const userId = data.user_id;
      if (typeof userId !== "number") {
        return;
      }
      if (event === "presence:user_status" && data.status === "offline") {
        onGameActivity(userId, null);
        return;
      }
      if (event === "presence:activity") {
        const game = typeof data.game === "string" ? data.game.trim() : "";
        onGameActivity(userId, game.length > 0 ? game : null);
      }
    });
    return () => {
      unsubscribeRealtime();
      unsubscribeStore();
    };
  }, []);
}

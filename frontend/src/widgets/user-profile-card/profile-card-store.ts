import { create } from "zustand";
import { registerSessionClear } from "@/shared/lib/session-reset";
import { playProfileOpenSound } from "@/features/ui-sounds/ui-sounds";

/** С какой стороны от триггера открыть карточку: правый сайдбар — слева, чат и голос — справа. */
export type ProfileCardSide = "left" | "right";

export type ProfileCardTarget = {
  userId: number;
  /** Имя из сообщения/голоса — на случай, если участника уже нет в списке. */
  fallbackName: string;
  anchor: { top: number; left: number; right: number; bottom: number };
  side: ProfileCardSide;
};

type State = {
  target: ProfileCardTarget | null;
  close: () => void;
};

export const useProfileCardStore = create<State>((set) => ({
  target: null,
  close: () => set({ target: null }),
}));

registerSessionClear(() => useProfileCardStore.getState().close());

/** Атрибут триггера: клик по нему же при открытой карточке закрывает её, а не открывает заново. */
export const PROFILE_TRIGGER_ATTR = "data-profile-trigger";

/** Повторный клик по тому же триггеру закрывает карточку; по другому — переносит её туда. */
export function toggleProfileCard(
  userId: number,
  fallbackName: string,
  anchorEl: Element,
  side: ProfileCardSide,
): void {
  const { target } = useProfileCardStore.getState();
  const rect = anchorEl.getBoundingClientRect();
  if (target?.userId === userId && target.anchor.top === rect.top && target.anchor.left === rect.left) {
    useProfileCardStore.setState({ target: null });
    return;
  }
  // Звук — здесь, в обработчике нажатия, а не в эффекте карточки: эффект при повторном монтировании
  // (StrictMode в dev, перенос карточки) играл его дважды, а на iPhone звук вне жеста не играет вовсе.
  playProfileOpenSound();
  useProfileCardStore.setState({
    target: {
      userId,
      fallbackName,
      anchor: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
      side,
    },
  });
}

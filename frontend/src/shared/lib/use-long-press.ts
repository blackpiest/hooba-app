import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

export const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

export type LongPressPoint = { x: number; y: number };

type Handlers = {
  "data-long-press": "";
  onPointerDownCapture: (event: ReactPointerEvent) => void;
  onPointerMoveCapture: (event: ReactPointerEvent) => void;
  onPointerUpCapture: () => void;
  onPointerCancelCapture: () => void;
};

/**
 * Ядро долгого нажатия без React и DOM: палец опущен → таймер; сдвиг дальше допуска, отпускание или отмена — сброс.
 * Учитывается только касание (`pointerType === "touch"`).
 */
export function createLongPress(onFire: (point: LongPressPoint) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: LongPressPoint | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    start = null;
  };

  return {
    down(point: LongPressPoint, pointerType: string) {
      if (pointerType !== "touch") return;
      cancel();
      start = point;
      timer = setTimeout(() => {
        timer = null;
        start = null;
        onFire(point);
      }, LONG_PRESS_MS);
    },
    move(point: LongPressPoint) {
      if (!start) return;
      if (Math.abs(point.x - start.x) > MOVE_TOLERANCE_PX || Math.abs(point.y - start.y) > MOVE_TOLERANCE_PX) cancel();
    },
    cancel,
  };
}

/**
 * Долгое нажатие пальцем — замена ПКМ на тач-устройствах. Срабатывает только для касания,
 * отменяется сдвигом пальца (прокрутка) и отпусканием. После срабатывания гасит следующий click,
 * чтобы нажатие не открыло ещё и то, что висит на обычном тапе.
 *
 * Обработчики — в фазе захвата: кнопки react-aria останавливают всплытие pointerdown. Вложенный элемент
 * со своим долгим нажатием (`data-long-press`) перехватывает его у внешнего.
 */
export function useLongPress(
  onLongPress: ((point: LongPressPoint) => void) | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): Handlers | Record<string, never> {
  const callback = useRef(onLongPress);
  useEffect(() => {
    callback.current = onLongPress;
  });
  const press = useRef<ReturnType<typeof createLongPress> | null>(null);
  useEffect(() => {
    const tracker = createLongPress((point) => {
      navigator.vibrate?.(10);
      suppressNextClick();
      callback.current?.(point);
    });
    press.current = tracker;
    return tracker.cancel;
  }, []);

  if (!enabled || !onLongPress) return {};

  return {
    "data-long-press": "",
    onPointerDownCapture: (event) => {
      const owner = (event.target as Element | null)?.closest?.("[data-long-press]");
      if (owner && owner !== event.currentTarget) return;
      press.current?.down({ x: event.clientX, y: event.clientY }, event.pointerType);
    },
    onPointerMoveCapture: (event) => press.current?.move({ x: event.clientX, y: event.clientY }),
    onPointerUpCapture: () => press.current?.cancel(),
    onPointerCancelCapture: () => press.current?.cancel(),
  };
}

/** Глотает один click сразу после долгого нажатия (браузер шлёт его при отпускании пальца). */
function suppressNextClick() {
  const swallow = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 800);
}

/**
 * Событие-заглушка для обработчиков `onContextMenu`, вызванных долгим нажатием или кнопкой «…»:
 * им нужны только координаты, preventDefault и currentTarget.
 */
export function contextMenuEventAt<E extends Element = Element>(point: LongPressPoint, target?: E | null) {
  return {
    clientX: point.x,
    clientY: point.y,
    currentTarget: target ?? null,
    target: target ?? null,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as ReactMouseEvent<E>;
}

import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { isTouchInput } from "@/hooks/use-breakpoint";

const PIP_WIDTH = 360;
const PIP_HEIGHT = 220;
const PIP_MARGIN = 16;
const PIP_BOTTOM_MARGIN = 96;

type PipBox = { x: number; y: number; w: number; h: number };

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function axisLimit(available: number, preferredMin: number): { min: number; max: number } {
  const max = Math.max(96, available - PIP_MARGIN);
  const min = Math.min(preferredMin, max);
  return { min, max };
}

function clampBox(box: PipBox, width: number, height: number): PipBox {
  const widthLimit = axisLimit(width, 240);
  const heightLimit = axisLimit(height, 135);
  const w = clamp(box.w, widthLimit.min, widthLimit.max);
  const h = clamp(box.h, heightLimit.min, heightLimit.max);
  return {
    x: clamp(box.x, 8, Math.max(8, width - w - 8)),
    y: clamp(box.y, 8, Math.max(8, height - h - 8)),
    w,
    h,
  };
}

function sameBox(a: PipBox, b: PipBox): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function bindPointerDrag(event: ReactPointerEvent<HTMLElement>, onMove: (dx: number, dy: number) => void) {
  const startX = event.clientX;
  const startY = event.clientY;
  const pointerId = event.pointerId;
  try {
    event.currentTarget.setPointerCapture(pointerId);
  } catch {
    // Жест уже завершён или указатель не захвачен страницей.
  }
  const move = (pointerEvent: PointerEvent) => {
    if (pointerEvent.pointerId !== pointerId) {
      return;
    }
    onMove(pointerEvent.clientX - startX, pointerEvent.clientY - startY);
  };
  const end = (pointerEvent: PointerEvent) => {
    if (pointerEvent.pointerId !== pointerId) {
      return;
    }
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

/** Плавающее окно поверх родителя `frameRef`: место, перетаскивание за шапку, размер за уголок. */
export function usePipBox(frameRef: RefObject<HTMLDivElement | null>, isStage: boolean) {
  const [pipBox, setPipBox] = useState<PipBox | null>(null);

  useLayoutEffect(() => {
    if (isStage) {
      return;
    }
    const parent = frameRef.current?.parentElement;
    if (!parent) {
      return;
    }
    const rect = parent.getBoundingClientRect();
    setPipBox((current) => {
      if (current == null) {
        // Телефон: окошко минимального размера, чтобы не закрывать ленту; размер меняется уголком.
        const compact = isTouchInput();
        const w = Math.min(compact ? 240 : PIP_WIDTH, Math.max(160, rect.width - 32));
        const h = Math.min(compact ? 135 : PIP_HEIGHT, Math.max(120, rect.height - 32));
        return clampBox(
          { x: rect.width - w - PIP_MARGIN, y: rect.height - h - PIP_BOTTOM_MARGIN, w, h },
          rect.width,
          rect.height,
        );
      }
      const next = clampBox(current, rect.width, rect.height);
      return sameBox(next, current) ? current : next;
    });
  }, [frameRef, isStage]);

  useEffect(() => {
    if (isStage) {
      return;
    }
    const parent = frameRef.current?.parentElement;
    if (!parent) {
      return;
    }
    const apply = () => {
      const rect = parent.getBoundingClientRect();
      setPipBox((current) => {
        if (!current) {
          return current;
        }
        const next = clampBox(current, rect.width, rect.height);
        return sameBox(next, current) ? current : next;
      });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [frameRef, isStage]);

  const style: CSSProperties | undefined = isStage
    ? undefined
    : pipBox
      ? { left: pipBox.x, top: pipBox.y, width: pipBox.w, height: pipBox.h }
      : { right: PIP_MARGIN, bottom: PIP_BOTTOM_MARGIN, width: PIP_WIDTH, height: PIP_HEIGHT };

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isStage || !pipBox) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, label")) {
      return;
    }
    event.preventDefault();
    const origin = pipBox;
    const parent = frameRef.current?.parentElement?.getBoundingClientRect();
    if (!parent) {
      return;
    }
    bindPointerDrag(event, (dx, dy) => {
      setPipBox(clampBox({ ...origin, x: origin.x + dx, y: origin.y + dy }, parent.width, parent.height));
    });
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pipBox) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const origin = pipBox;
    const parent = frameRef.current?.parentElement?.getBoundingClientRect();
    if (!parent) {
      return;
    }
    bindPointerDrag(event, (dx, dy) => {
      setPipBox(clampBox({ ...origin, w: origin.w + dx, h: origin.h + dy }, parent.width, parent.height));
    });
  };

  return { style, onHeaderPointerDown, onResizePointerDown };
}

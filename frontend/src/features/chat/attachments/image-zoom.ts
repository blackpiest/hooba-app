export type ZoomPan = { x: number; y: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
/** Ступени зума для одиночных кликов ЛКМ. */
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const;

/** Следующая ступень выше текущей; на пределе — сброс к исходному масштабу. */
export function nextZoomStep(zoom: number): number {
  const next = ZOOM_STEPS.find((step) => step > zoom + 1e-6);
  return next ?? ZOOM_MIN;
}

/** Не даёт увеличенной картинке уехать за край области просмотра (пустого поля не остаётся). */
export function clampPan(pan: ZoomPan, zoom: number, image: { w: number; h: number }, viewport: { w: number; h: number }): ZoomPan {
  const maxX = Math.max(0, (image.w * zoom - viewport.w) / 2);
  const maxY = Math.max(0, (image.h * zoom - viewport.h) / 2);
  return {
    // `|| 0` убирает -0, который даёт Math.max(-0, …).
    x: Math.min(maxX, Math.max(-maxX, pan.x)) || 0,
    y: Math.min(maxY, Math.max(-maxY, pan.y)) || 0,
  };
}

/**
 * Сдвиг при смене масштаба с неподвижной точкой.
 * `focus` — точка относительно центра картинки без учёта сдвига (в пикселях экрана).
 */
export function panForZoomAt(pan: ZoomPan, fromZoom: number, toZoom: number, focus: ZoomPan): ZoomPan {
  const k = toZoom / fromZoom;
  return {
    x: focus.x - (focus.x - pan.x) * k,
    y: focus.y - (focus.y - pan.y) * k,
  };
}

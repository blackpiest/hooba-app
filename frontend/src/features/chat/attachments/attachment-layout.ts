const SINGLE_MAX_W = 400;
const SINGLE_MAX_H = 320;

/** Размер одиночной картинки в ленте: вписать в 400×320, не увеличивая. Место резервируется до загрузки. */
export function singleImageBox(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = Math.min(1, SINGLE_MAX_W / w, SINGLE_MAX_H / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

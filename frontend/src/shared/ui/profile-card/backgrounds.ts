import type { CSSProperties } from "react";
import type { BackgroundLayerSpec, BackgroundSpec } from "./cosmetics";

/** SVG-тайл из битмапа: мотив в каждой точке `offsets` квадрата `size`×`size`. */
function tile(map: readonly string[], color: string, px: number, size: number, offsets: readonly (readonly [number, number])[]): string {
  let rects = "";
  for (const [ox, oy] of offsets) {
    map.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === "#") {
          rects += `<rect x="${ox + x * px}" y="${oy + y * px}" width="${px}" height="${px}"/>`;
        }
      });
    });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" shape-rendering="crispEdges" fill="${color}">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Слои приходят из каталога и живут, пока он не обновится: SVG собираем один раз на слой. */
const imageByLayer = new WeakMap<BackgroundLayerSpec, string>();

/** CSS-картинка тайла слоя: битмап → data-URI SVG, файл → URL с сервера. */
export function layerImage(layer: BackgroundLayerSpec): string {
  let image = imageByLayer.get(layer);
  if (image === undefined) {
    image =
      "url" in layer
        ? `url(${JSON.stringify(layer.url)})`
        : tile(layer.bitmap, layer.color, layer.px, layer.size, layer.offsets);
    imageByLayer.set(layer, image);
  }
  return image;
}

/** Подложка фона: `--bgc` или радиальный градиент. Без подложки — цвет бренда (`ds-pc-bg`). */
export function backgroundBaseStyle(spec: BackgroundSpec): CSSProperties | undefined {
  const base = spec.base;
  if (!base) {
    return undefined;
  }
  return "gradient" in base
    ? { background: `radial-gradient(circle at 50% 30%, ${base.gradient.from}, ${base.gradient.to} 70%)` }
    : ({ "--bgc": base.color } as CSSProperties);
}

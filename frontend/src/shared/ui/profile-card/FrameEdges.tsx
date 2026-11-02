import { memo, type CSSProperties } from "react";
import type { FrameEdgeSpec } from "./cosmetics";

/** Положение выступа: снаружи своей стороны рамки, центр — в `at` % её длины. */
function edgePosition({ side, at }: FrameEdgeSpec): CSSProperties {
  switch (side) {
    case "top":
      return { bottom: "100%", left: `${at}%`, transform: "translateX(-50%)" };
    case "bottom":
      return { top: "100%", left: `${at}%`, transform: "translateX(-50%)" };
    case "left":
      return { right: "100%", top: `${at}%`, transform: "translateY(-50%)" };
    case "right":
      return { left: "100%", top: `${at}%`, transform: "translateY(-50%)" };
  }
}

/** Пиксельный выступ: столбики высотой `steps` растут наружу от стороны рамки. */
function FrameEdge({ edge }: { edge: FrameEdgeSpec }) {
  const { side, steps, px } = edge;
  const depth = Math.max(...steps, 1);
  const length = steps.length * px;
  const vertical = side === "top" || side === "bottom";
  const rects = steps.map((h, i) => {
    if (h === 0) {
      return null;
    }
    const along = i * px;
    // Столбик прижат к стороне рамки: у top/left — к дальнему краю svg.
    const across = side === "top" || side === "left" ? depth - h : 0;
    return vertical ? (
      <rect key={i} x={along} y={across} width={px} height={h} />
    ) : (
      <rect key={i} x={across} y={along} width={h} height={px} />
    );
  });
  return (
    <svg
      className="absolute"
      width={vertical ? length : depth}
      height={vertical ? depth : length}
      shapeRendering="crispEdges"
      style={{ ...edgePosition(edge), fill: edge.color ?? "var(--frame)" }}
    >
      {rects}
    </svg>
  );
}

/**
 * Выступы за край рамки (льдинки, сосульки): форма рамки перестаёт быть ровным прямоугольником.
 * Снаружи до 12px — сверху и по бокам укладываются в отступ карточки только до 8px (§3 PROFILE_COSMETICS_SPEC_V1).
 */
export const FrameEdges = memo(function FrameEdges({ edges }: { edges: FrameEdgeSpec[] }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {edges.map((edge, i) => (
        <FrameEdge key={i} edge={edge} />
      ))}
    </div>
  );
});

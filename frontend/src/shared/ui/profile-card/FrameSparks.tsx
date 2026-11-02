import { memo, type CSSProperties } from "react";
import type { FrameSparkSpec, FrameSparksSpec } from "./cosmetics";

/** Тень искры: тонкий контур и свечение. Снежинка обрезана маской, поэтому ей — drop-shadow по силуэту. */
function sparkShadow(spark: FrameSparkSpec, outline: string | null, glowBlur: number, flake: boolean): CSSProperties {
  if (flake) {
    const shadows = [
      ...(outline ? ["1px 0", "-1px 0", "0 1px", "0 -1px"].map((o) => `drop-shadow(${o} 0 ${outline})`) : []),
      glowBlur > 0 ? `drop-shadow(0 0 ${glowBlur / 2}px ${spark.glow})` : "",
    ].filter(Boolean);
    return { filter: shadows.join(" ") || "none" };
  }
  const shadows = [outline ? `0 0 0 1px ${outline}` : "", glowBlur > 0 ? `0 0 ${glowBlur}px 1px ${spark.glow}` : ""];
  return { boxShadow: shadows.filter(Boolean).join(", ") || "none" };
}

/**
 * Искры вокруг рамки (слой 248×320): позиции фиксированы в каталоге — без Math.random рендер стабилен.
 * Могут выступать наружу до 8px и заходить в окно, но не трогают табличку имени и нижнюю полосу.
 * `rise` < 0 — падают; `shape: flake` — пиксельная снежинка (`ds-pc-spark-flake`).
 */
export const FrameSparks = memo(function FrameSparks({ sparks }: { sparks: FrameSparksSpec }) {
  const { outline, glowBlur } = sparks;
  const flake = sparks.shape === "flake";
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      style={{ "--rise": `${sparks.rise}px`, "--end-scale": sparks.endScale } as CSSProperties}
    >
      {sparks.items.map((spark, i) => (
        <span
          key={i}
          className="ds-pc-spark"
          style={
            {
              left: `${spark.x}%`,
              top: `${spark.y}%`,
              background: flake ? undefined : spark.color,
              ...sparkShadow(spark, outline, glowBlur, flake),
              "--spark-dx": `${spark.dx}px`,
              "--spark-size": `${spark.size}px`,
              animationDelay: `${spark.delay}s`,
              animationDuration: `${spark.dur}s`,
            } as CSSProperties
          }
        >
          {flake ? <span className="ds-pc-spark-flake" style={{ background: spark.color }} /> : null}
        </span>
      ))}
    </div>
  );
});

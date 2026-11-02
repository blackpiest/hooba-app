import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { backgroundBaseStyle, layerImage } from "./backgrounds";
import type { BackgroundSpec, CharacterIdleSpec, CosmeticLayerSpec, FrameSpec } from "./cosmetics";
import { frameSkin } from "./frame-skins";
import { FrameEdges } from "./FrameEdges";
import { FrameSparks } from "./FrameSparks";

/**
 * Пиксельный фон косметики по спеке из каталога: подложка и слои тайлов (`ds-pc-bg*`, styles/ds-utilities.css).
 * `still` — без движения и виньетки (маленькие аватары, миниатюры); плотность тайла задаёт `--tile-scale`.
 */
export function ProfileBackground({ spec, still = false, className }: { spec: BackgroundSpec; still?: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cx("ds-pc-bg", still && "ds-pc-bg--still", className)} style={backgroundBaseStyle(spec)}>
      {spec.layers.map((layer, i) => (
        <span
          key={i}
          className={cx(
            "ds-pc-bg-layer",
            layer.motion !== "none" && `ds-pc-bg-layer--${layer.motion}`,
            layer.blink && "ds-pc-bg-layer--blink",
            "url" in layer && "ds-pc-bg-layer--image",
          )}
          style={{ "--tile": layerImage(layer), "--tile-px": `${layer.size}px` } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** Тёмная табличка с пиксельным контуром: имя, статус. Для интерактивной версии — `Button variant="plate"`. */
export function ProfilePlate({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("ds-px-plate inline-flex min-w-0 items-center", className)}>{children}</span>
  );
}

export type ProfileCardFrameProps = {
  /** Скин рамки из каталога; null/нет — базовая. */
  skin?: FrameSpec | null;
  /** Имя: табличка поверх верхней грани рамки. */
  title: ReactNode;
  /** Вторая строка таблички под именем (титул). */
  subtitle?: ReactNode;
  /** Поверх окна в левом нижнем углу (закреплённые значки). */
  overlay?: ReactNode;
  /** @username: слева в нижней полосе, одной строкой с многоточием. Передавать текст или строчный `<span>`, без своих `truncate`/`block` — они срежут контур. */
  username: ReactNode;
  /** Статус: справа в нижней полосе (`ProfilePlate` или `Button variant="plate"`). */
  status: ReactNode;
  /** Содержимое окна: слои косметики или запасной вариант. */
  children: ReactNode;
  className?: string;
};

/**
 * Рамка мини-профиля: окно 7/8 с косметикой, имя на верхней грани, @username и статус в нижней полосе.
 * Стороны рамки фиксированы (10 · 14 · 46), поэтому любой скин совпадает с окном.
 * Роли, игра и действия рисуются под рамкой обычными компонентами кита.
 */
export function ProfileCardFrame({
  skin = null,
  title,
  subtitle,
  overlay,
  username,
  status,
  children,
  className,
}: ProfileCardFrameProps) {
  const { className: skinClass, style } = frameSkin(skin);
  return (
    <div
      className={cx(
        "relative isolate bg-[var(--frame)] px-2.5 pb-[46px] pt-3.5",
        skinClass,
        className,
      )}
      style={style}
    >
      <div className="relative aspect-[7/8] overflow-hidden bg-brand-soft shadow-[0_0_0_2px_var(--frame-line)]">
        {children}
        {overlay ? <div className="absolute bottom-1.5 left-1.5 z-[2] flex gap-1">{overlay}</div> : null}
      </div>
      {skin?.edges.length ? <FrameEdges edges={skin.edges} /> : null}
      {skin?.sparks ? <FrameSparks sparks={skin.sparks} /> : null}
      <div className="ds-px-plate absolute left-1/2 top-px z-[4] max-w-[calc(100%-40px)] -translate-x-1/2 overflow-hidden px-3.5 pb-[7px] pt-2 text-center font-heading text-[13px] uppercase leading-none">
        {title}
        {subtitle ? (
          <div className="mt-1 flex items-center justify-center gap-1 font-ui text-[11px] normal-case leading-none text-muted">
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="absolute inset-x-2.5 bottom-0 z-[4] flex h-[46px] items-center justify-between gap-2">
        <span className="ds-text-outline min-w-0 flex-1 px-0.5 text-[13px] font-semibold leading-tight text-fg">{username}</span>
        <span className="shrink-0">{status}</span>
      </div>
    </div>
  );
}

/**
 * Idle-спрайт: лента кадров в окне `ds-pc-char`, кадры листаются по `sequence` (Web Animations, ступенчато).
 * При `prefers-reduced-motion` стоит первый кадр.
 */
function CharacterSprite({ idle, onError }: { idle: CharacterIdleSpec; onError: () => void }) {
  const ref = useRef<HTMLImageElement>(null);
  const { frames, fps } = idle;
  const sequence = idle.sequence.join(",");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const order = sequence.split(",").map(Number);
    // Последний кадр повторён на offset 1: каждый элемент sequence держится ровно 1/fps.
    const keyframes = [...order, order[order.length - 1]].map((i) => ({
      transform: `translateX(${(-100 * i) / frames}%)`,
      easing: "steps(1, end)",
    }));
    const animation = el.animate(keyframes, { duration: (order.length / fps) * 1000, iterations: Infinity });
    return () => animation.cancel();
  }, [frames, fps, sequence]);
  return (
    <span aria-hidden="true" className="ds-pc-char ds-pc-char--sprite">
      <img
        ref={ref}
        src={idle.url}
        alt=""
        draggable={false}
        onError={onError}
        className="ds-pc-sprite"
        style={{ width: `${frames * 100}%` }}
      />
    </span>
  );
}

/**
 * Окно с косметикой: фон и персонаж с idle-анимацией (спрайт или покачивание картинки).
 * Без персонажа (или если картинка не загрузилась) — крупный инициал поверх фона.
 * Спрайт не загрузился — статичная картинка с покачиванием.
 */
export function ProfileCardWindow({
  background,
  character,
  fallbackInitial,
}: {
  background: BackgroundSpec | null;
  character: CosmeticLayerSpec | null;
  fallbackInitial: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [failedSprite, setFailedSprite] = useState<string | null>(null);
  const showCharacter = character !== null && failedUrl !== character.url;
  const idle = character?.idle && failedSprite !== character.idle.url ? character.idle : null;
  return (
    <>
      {background ? <ProfileBackground spec={background} /> : null}
      {showCharacter ? (
        <>
          {idle ? (
            <CharacterSprite idle={idle} onError={() => setFailedSprite(idle.url)} />
          ) : (
            <img
              src={character.url}
              alt=""
              draggable={false}
              onError={() => setFailedUrl(character.url)}
              className="ds-pc-char"
            />
          )}
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center font-heading text-6xl text-fg">{fallbackInitial}</div>
      )}
    </>
  );
}

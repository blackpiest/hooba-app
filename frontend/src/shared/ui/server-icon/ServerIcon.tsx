import { useState } from "react";
import { cx } from "@/utils/cx";

export type ServerIconSize = "sm" | "md" | "lg" | "xl" | "profile";

/** Размеры как у `Avatar`: sm 24 · md 32 · lg 40 · xl 48 · profile 80. */
const SIZE: Record<ServerIconSize, string> = {
  sm: "size-6 text-[11px]",
  md: "size-8 text-sm",
  lg: "size-10 text-sm",
  xl: "size-12 text-base",
  profile: "size-20 text-3xl",
};

export type ServerIconProps = {
  /** Название сервера: первая буква — заглушка, когда картинки нет или она не загрузилась. */
  name: string;
  /** Готовая ссылка на картинку (уже через `apiUrl`) или object URL превью. */
  src: string | null;
  size?: ServerIconSize;
  className?: string;
};

/** Аватар сервера: квадрат с тонкой рамкой, как аватар участника. */
export function ServerIcon({ name, src, size = "md", className }: ServerIconProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && failedSrc !== src;
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <span
      className={cx(
        "relative grid shrink-0 place-items-center overflow-hidden border border-line bg-bg",
        SIZE[size],
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-full place-items-center bg-brand-soft font-heading tracking-tight text-fg"
        >
          {initial}
        </span>
      )}
    </span>
  );
}

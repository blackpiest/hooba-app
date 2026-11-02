import { useState, type CSSProperties } from "react";
import type { PublicPresenceStatus } from "@/shared/presence";
import { cx } from "@/utils/cx";
import { ProfileBackground, type BackgroundSpec } from "@/shared/ui/profile-card";

export type AvatarSize = "sm" | "md" | "lg" | "xl" | "profile" | "preview";

/** Размеры совпадают со старыми (`avatar-sizes`): sm 24 · md 32 · lg 40 · xl 48 · profile 80 · preview 160/208. */
const SIZE: Record<AvatarSize, string> = {
  sm: "size-6 text-[11px]",
  md: "size-8 text-sm",
  lg: "size-10 text-sm",
  xl: "size-12 text-base",
  profile: "size-20 text-3xl",
  preview: "size-40 text-5xl sm:size-52",
};

const DOT_TONE: Record<PublicPresenceStatus, string> = {
  online: "bg-presence-online",
  idle: "bg-presence-idle",
  dnd: "bg-presence-dnd",
  offline: "bg-presence-offline",
};

/** Плотность тайла фона: на маленьком аватаре мотив мельче, чтобы он читался узором. */
const TILE: Record<AvatarSize, string> = {
  sm: "[--tile-scale:0.4]",
  md: "[--tile-scale:0.4]",
  lg: "[--tile-scale:0.5]",
  xl: "[--tile-scale:0.5]",
  profile: "[--tile-scale:0.7]",
  preview: "[--tile-scale:1]",
};

/** Косметика аватара: голова персонажа поверх фона (спека из каталога). null в поле — слоя нет. */
export type AvatarLook = { headUrl: string | null; background: BackgroundSpec | null };

/** Квадратный индикатор присутствия. Обводка берётся из `--dot-ring` (по умолчанию цвет поверхности). */
export function PresenceDot({
  status,
  size,
  className,
}: {
  status: PublicPresenceStatus;
  size?: AvatarSize;
  className?: string;
}) {
  const big = size === "profile" || size === "preview";
  return (
    <span
      aria-hidden="true"
      className={cx(
        "absolute",
        // Отступ равен ширине обводки (4px / 2px): иначе она выходит за край аватара.
        big ? "bottom-1 right-1 size-5" : "bottom-0.5 right-0.5 size-1.5",
        big ? "shadow-[0_0_0_4px_var(--dot-ring,var(--color-surface))]" : "shadow-[0_0_0_2px_var(--dot-ring,var(--color-surface))]",
        DOT_TONE[status],
        className,
      )}
    />
  );
}

export type AvatarProps = {
  /** Имя: берётся первая буква для заглушки. */
  name: string;
  /** Голова персонажа и фон. Без персонажа (или если не загрузился) — буква, поверх фона, если он выбран. */
  look?: AvatarLook | null;
  size?: AvatarSize;
  status?: PublicPresenceStatus;
  /** Подсветка «говорит» (зелёная рамка). */
  speaking?: boolean;
  /** Цвет фона заглушки (по умолчанию тон бренда). */
  tone?: string;
  className?: string;
};

/**
 * Аватар дизайн-системы: квадратный, с тонкой рамкой, статус — квадратная точка.
 * Чистый презентационный компонент; для аватара пользователя из стора — `UserAvatar`.
 */
export function Avatar({ name, look, size = "md", status, speaking = false, tone, className }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const headUrl = look?.headUrl ?? null;
  const showHead = headUrl !== null && failedUrl !== headUrl;
  const background = look?.background ?? null;
  const initial = name.slice(0, 1).toUpperCase() || "?";
  const style = tone ? ({ "--avatar-tone": tone } as CSSProperties) : undefined;

  return (
    <span className={cx("relative inline-flex shrink-0", className)} style={style}>
      <span
        className={cx(
          "relative grid place-items-center overflow-hidden border border-line bg-bg",
          SIZE[size],
          speaking && "border-success shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-success)]",
          status === "offline" && "opacity-60",
        )}
      >
        {background ? <ProfileBackground spec={background} still className={TILE[size]} /> : null}
        {showHead ? (
          <img
            src={headUrl}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={() => setFailedUrl(headUrl)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span
            className={cx(
              "relative grid size-full place-items-center font-heading tracking-tight text-fg",
              background ? "ds-px-outline" : status === "offline" ? "bg-line" : "bg-(--avatar-tone,var(--color-brand-soft))",
            )}
          >
            {initial}
          </span>
        )}
      </span>
      {status === undefined ? null : <PresenceDot status={status} size={size} />}
    </span>
  );
}

/** Несколько аватаров внахлёст + «+N». */
export function AvatarStack({ items, max = 3, size = "md" }: { items: AvatarProps[]; max?: number; size?: AvatarSize }) {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <span className="inline-flex">
      {shown.map((item, index) => (
        <Avatar
          key={`${item.name}-${index}`}
          {...item}
          size={size}
          className={cx("[--dot-ring:var(--color-bg)]", index > 0 && "-ml-2.5", item.className)}
        />
      ))}
      {rest > 0 ? (
        <span
          className={cx(
            "-ml-2.5 grid place-items-center border border-line bg-elevated font-label text-[10px] text-muted",
            SIZE[size],
          )}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

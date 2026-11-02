import type { CSSProperties, ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon } from "@/shared/ui/icon";

/* ---------- Badge ---------- */

export type BadgeVariant = "neutral" | "brand" | "success" | "warning" | "danger" | "live";

const BADGE: Record<BadgeVariant, string> = {
  neutral: "border-line bg-elevated text-muted",
  brand: "border-brand/50 bg-brand-soft text-brand-fg",
  success: "border-success/40 bg-success/15 text-success",
  warning: "border-warning/40 bg-warning/15 text-warning",
  danger: "border-danger/40 bg-danger/15 text-danger",
  /** Метка «в эфире». */
  live: "h-4 border-accent bg-accent px-[5px] text-[8px] tracking-normal text-on-accent",
};

export function Badge({
  variant = "neutral",
  dot,
  children,
  className,
}: {
  variant?: BadgeVariant;
  /** Квадратная точка перед текстом (статус). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-[22px] items-center gap-1.5 border px-2 font-label text-[9px] uppercase leading-none tracking-[0.1em]",
        BADGE[variant],
        className,
      )}
    >
      {dot ? <i className="size-[5px] bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/* ---------- Counter ---------- */

/** Счётчик непрочитанного. Больше `max` показывается как «99+». */
export function Counter({
  value,
  max = 99,
  muted,
  className,
}: {
  value: number;
  max?: number;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-grid h-[18px] min-w-[18px] place-items-center px-[5px] font-label text-[10px] font-bold leading-none",
        muted ? "bg-line-strong text-fg" : "bg-accent text-on-accent",
        className,
      )}
    >
      {value > max ? `${max}+` : value}
    </span>
  );
}

/** Точка «есть непрочитанное» без числа. `label` — подпись для скринридера, если точка значит другое. */
export function UnreadDot({ label = "Есть непрочитанное", className }: { label?: string; className?: string }) {
  return <span role="img" aria-label={label} className={cx("inline-block size-1.5 bg-accent", className)} />;
}

/* ---------- Tag ---------- */

/** Метка/фильтр. С `onRemove` показывает крестик удаления. */
export function Tag({
  children,
  onRemove,
  removeLabel = "Убрать",
  className,
}: {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-1.5 border border-line-strong bg-surface pl-2.5 text-xs text-fg",
        onRemove ? "pr-1.5" : "pr-2.5",
        className,
      )}
    >
      {children}
      {onRemove ? (
        <AriaButton
          aria-label={removeLabel}
          onPress={onRemove}
          className="grid size-[18px] cursor-pointer place-items-center text-muted data-[hovered]:bg-elevated data-[hovered]:text-fg ds-focus"
        >
          <Icon name="close" size="xs" />
        </AriaButton>
      ) : null}
    </span>
  );
}

/* ---------- RoleBadge ---------- */

/**
 * Роль с её цветом (цвет задаётся пользователем в RolesPanel, поэтому приходит строкой).
 * `chip` — плашка с рамкой, по умолчанию — квадратик и подпись.
 */
export function RoleBadge({
  color,
  children,
  chip,
  onRemove,
  removeLabel = "Снять роль",
  removeDisabled,
  className,
}: {
  /** CSS-цвет роли, например `#F2B84B`. */
  color: string;
  children?: ReactNode;
  chip?: boolean;
  /** Крестик в плашке (только с `chip`): снять роль. */
  onRemove?: () => void;
  removeLabel?: string;
  removeDisabled?: boolean;
  className?: string;
}) {
  return (
    <span
      style={{ "--role": color } as CSSProperties}
      className={cx(
        "inline-flex items-center gap-[7px] font-label text-[9px] uppercase leading-none tracking-[0.12em]",
        "text-[color-mix(in_srgb,var(--role)_70%,white)] before:size-[7px] before:bg-(--role) before:content-['']",
        chip &&
          "h-[22px] border border-[color-mix(in_srgb,var(--role)_55%,var(--color-bg))] bg-[color-mix(in_srgb,var(--role)_12%,var(--color-bg))] px-2",
        chip && onRemove && "pr-0.5",
        className,
      )}
    >
      {children}
      {chip && onRemove ? (
        <AriaButton
          aria-label={removeLabel}
          onPress={onRemove}
          isDisabled={removeDisabled}
          className="grid size-[18px] cursor-pointer place-items-center text-current data-[disabled]:cursor-default data-[disabled]:opacity-40 data-[hovered]:bg-fg/15 ds-focus"
        >
          <Icon name="close" size="xs" />
        </AriaButton>
      ) : null}
    </span>
  );
}

/* ---------- Kbd ---------- */

export function Kbd({ children, recording, className }: { children: ReactNode; recording?: boolean; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-6 min-w-6 items-center justify-center border border-b-[3px] px-[7px] font-label text-[11px]",
        recording ? "border-accent text-accent" : "border-line-strong bg-surface text-fg",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Сочетание клавиш: `<KbdCombo keys={["Ctrl", "Shift", "M"]} />`. */
export function KbdCombo({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1 font-label text-[11px] text-muted">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? "+" : null}
          <Kbd>{key}</Kbd>
        </span>
      ))}
    </span>
  );
}

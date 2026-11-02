import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cx } from "@/utils/cx";
import { useIsTouch } from "@/hooks/use-breakpoint";
import { contextMenuEventAt, useLongPress } from "@/shared/lib/use-long-press";
import { Icon, type IconName } from "@/shared/ui/icon";
import { listItemClass, type ListItemState } from "./list-item-styles";

/* ---------- ListItem ---------- */

export type ListItemProps = ListItemState &
  Omit<AriaButtonProps, "className" | "style" | "children"> & {
    /** Название (одна строка, обрезается). */
    children: ReactNode;
    /** Иконка слева (имя из набора или свой узел). */
    icon?: IconName | ReactNode;
    /** Аватар или другой элемент слева вместо иконки. */
    leading?: ReactNode;
    /** Вторая строка мелким шрифтом (игра, статус). */
    description?: ReactNode;
    /** Справа: счётчик, замок, индикатор говорящего. Скрывается, когда видны `actions`. */
    trailing?: ReactNode;
    /** Кнопки действий: показываются при наведении и фокусе строки. Отдельные кнопки — не внутри основной. */
    actions?: ReactNode;
    onContextMenu?: MouseEventHandler<HTMLDivElement>;
    className?: string;
  };

/**
 * Строка списка: канал, участник, голосовой участник. Основная область — кнопка (`onPress`),
 * `actions` — отдельные кнопки рядом, чтобы не вкладывать кнопку в кнопку.
 */
export function ListItem({
  children,
  icon,
  leading,
  description,
  trailing,
  actions,
  active,
  unread,
  muted,
  danger,
  size,
  onContextMenu,
  className,
  ...buttonProps
}: ListItemProps) {
  const isTouch = useIsTouch();
  // Тач: ПКМ нет — то же меню по долгому нажатию.
  const longPress = useLongPress(
    isTouch && onContextMenu ? (point) => onContextMenu(contextMenuEventAt<HTMLDivElement>(point)) : null,
  );
  const lead =
    leading ?? (typeof icon === "string" ? <Icon name={icon as IconName} size="sm" className="text-current" /> : icon);
  return (
    <div className={cx(listItemClass({ active, unread, muted, danger, size }), className)} onContextMenu={onContextMenu} {...longPress}>
      <AriaButton
        {...buttonProps}
        aria-current={active ? "true" : undefined}
        className="ds-focus flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 self-stretch text-left outline-none data-[disabled]:cursor-not-allowed"
      >
        {lead ? <span className="flex shrink-0 items-center">{lead}</span> : null}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{children}</span>
          {description ? <span className="truncate text-[11px] font-normal text-muted">{description}</span> : null}
        </span>
      </AriaButton>
      {trailing ? (
        <span className={cx("ml-auto flex shrink-0 items-center gap-1.5", actions && "group-focus-within:hidden group-hover:hidden")}>
          {trailing}
        </span>
      ) : null}
      {actions ? <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex touch:flex">{actions}</span> : null}
    </div>
  );
}

/* ---------- ListGroup: заголовок группы ---------- */

export function ListGroup({ label, action }: { label: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2.5 pb-1.5 pt-3.5 font-label text-[9px] uppercase tracking-[0.12em] text-muted">
      <span>{label}</span>
      {action}
    </div>
  );
}

/* ---------- Индикаторы голоса ---------- */

/** Эквалайзер «говорит». */
export function SpeakingEq({ className }: { className?: string }) {
  const bars: { h: string; d: string }[] = [
    { h: "h-[11px]", d: "-0.3s" },
    { h: "h-2", d: "-0.7s" },
    { h: "h-[13px]", d: "-0.1s" },
    { h: "h-[7px]", d: "-0.5s" },
  ];
  return (
    <span role="img" aria-label="Говорит" className={cx("inline-flex h-3 items-end gap-0.5 text-success", className)}>
      {bars.map((bar, index) => (
        <i key={index} style={{ "--d": bar.d } as CSSProperties} className={cx("ds-eq w-0.5 bg-current", bar.h)} />
      ))}
    </span>
  );
}

/** Значок выключенного микрофона / звука у участника голосовой комнаты. */
export function VoiceStateIcon({ kind, className }: { kind: "muted" | "deafened"; className?: string }) {
  return (
    <span
      role="img"
      aria-label={kind === "muted" ? "Микрофон выключен" : "Звук выключен"}
      className={cx("inline-flex text-danger", className)}
    >
      <Icon name={kind === "muted" ? "mic-off" : "headphones-off"} size="sm" />
    </span>
  );
}

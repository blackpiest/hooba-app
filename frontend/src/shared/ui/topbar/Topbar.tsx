import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Icon, type IconName } from "@/shared/ui/icon";
import { IconButton } from "@/shared/ui/button";

export type TopbarProps = {
  /** Название канала или экрана. */
  title: ReactNode;
  /** Иконка перед названием (`hash`, `speaker`). */
  icon?: IconName;
  /** Слева от названия: например кнопка «назад» на телефоне. */
  leading?: ReactNode;
  /** Мелкая метка перед названием («ROOM»). */
  prefix?: ReactNode;
  /** Индикатор рядом с названием (точка «в сети»). */
  status?: ReactNode;
  /** Кнопки справа (`IconButton`). */
  children?: ReactNode;
  /** Самый правый край: например `WindowControls`. */
  trailing?: ReactNode;
  className?: string;
};

/** Шапка канала / экрана. Высота 52px. */
export function Topbar({ title, icon, leading, prefix, status, children, trailing, className }: TopbarProps) {
  return (
    <header className={cx("flex h-[52px] shrink-0 items-center gap-4 border-b border-line bg-bg px-4 max-md:gap-2 max-md:px-2", leading && "pl-2", className)}>
      {leading ? <div className="-mr-2 flex shrink-0 items-center">{leading}</div> : null}
      <div className="flex min-w-0 items-center gap-3 whitespace-nowrap">
        {prefix ? <span className="font-label text-[9px] tracking-[0.1em] text-muted">{prefix}</span> : null}
        {icon ? <Icon name={icon} size="sm" className="text-muted" /> : null}
        <strong className="truncate text-[15px] font-semibold">{title}</strong>
        {status}
      </div>
      <div className="ml-auto flex items-center gap-0.5">{children}</div>
      {trailing}
    </header>
  );
}

/* ---------- WindowControls ---------- */

export type WindowControlsProps = {
  isMaximized?: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  className?: string;
};

/** Кнопки окна Electron (визуальный слой; вызовы IPC передаёт `widgets/window-controls`). */
export function WindowControls({ isMaximized, onMinimize, onToggleMaximize, onClose, className }: WindowControlsProps) {
  return (
    <div className={cx("inline-flex", className)}>
      <IconButton icon="window-min" label="Свернуть" onPress={onMinimize} className="h-7 w-[42px]" />
      <IconButton
        icon={isMaximized ? "window-restore" : "window-max"}
        label={isMaximized ? "Восстановить" : "Развернуть"}
        onPress={onToggleMaximize}
        className="h-7 w-[42px]"
      />
      <IconButton
        icon="close"
        label="Закрыть"
        onPress={onClose}
        className="h-7 w-[42px] data-[hovered]:bg-danger data-[hovered]:text-on-accent"
      />
    </div>
  );
}

import type { ReactElement, ReactNode, Ref } from "react";
import { Button as AriaButton } from "react-aria-components";
import { cx } from "@/utils/cx";

export type UserDockProps = {
  /** Аватар пользователя (со статусом). */
  avatar: ReactNode;
  name: string;
  /** Вторая строка: статус или игра. */
  subtitle?: ReactNode;
  /** Нажатие на имя — меню статуса / профиль. */
  onPress?: () => void;
  /** Имя кнопки для скринридера (по умолчанию «Профиль: <имя>»). */
  userLabel?: string;
  /** Оборачивает кнопку пользователя, например в `DropdownMenu` (меню статуса): получает кнопку-триггер. */
  wrapUser?: (userButton: ReactElement) => ReactElement;
  /** Ref кнопки пользователя: якорь для подсказок (`AnchoredPopover`). */
  userButtonRef?: Ref<HTMLButtonElement>;
  /** Кнопки справа: микрофон, звук, настройки (`IconButton`). */
  children?: ReactNode;
  className?: string;
};

/** Панель текущего пользователя внизу левой колонки. */
export function UserDock({ avatar, name, subtitle, onPress, userLabel, wrapUser, userButtonRef, children, className }: UserDockProps) {
  const userButton = (
    <AriaButton
      ref={userButtonRef}
      onPress={onPress}
      isDisabled={!onPress && !wrapUser}
      aria-label={userLabel ?? `Профиль: ${name}`}
      className="ds-focus flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-1.5 py-1 text-left outline-none data-[disabled]:cursor-default data-[hovered]:bg-surface"
    >
      {avatar}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13px] font-semibold text-fg">{name}</span>
        {subtitle ? <span className="truncate text-[11px] text-muted">{subtitle}</span> : null}
      </span>
    </AriaButton>
  );
  return (
    <div className={cx("flex items-center gap-2 border-t border-line bg-bg p-2", className)}>
      {wrapUser ? wrapUser(userButton) : userButton}
      {children ? <div className="flex shrink-0 items-center gap-0.5">{children}</div> : null}
    </div>
  );
}

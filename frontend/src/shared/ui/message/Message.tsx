import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Button } from "@/shared/ui/button";

export type MessageStatus = "sent" | "pending" | "failed" | "deleted";

export type MessageProps = {
  author: string;
  /** Аватар слева (`Avatar` / `UserAvatar`). У продолжения того же автора не нужен. */
  avatar?: ReactNode;
  /** Время («21:04»). У продолжения показывается слева при наведении. */
  time?: string;
  /** Роль автора рядом с именем (`RoleBadge`). */
  roleBadge?: ReactNode;
  /** `pending` — отправляется, `failed` — не доставлено (кнопки «Повторить» / «Удалить»), `deleted` — удалено модератором. */
  status?: MessageStatus;
  onRetry?: () => void;
  /** Убрать неотправленное сообщение. */
  onDiscard?: () => void;
  /** Нажатие на аватар или имя автора (мини-профиль); `anchor` — кнопка, к которой крепится карточка. */
  onAuthorPress?: (anchor: HTMLElement) => void;
  /** Сообщение было отредактировано: после текста появится «изменено». */
  edited?: boolean;
  /** Следующее сообщение того же автора: без аватара и имени. */
  continuation?: boolean;
  /** Текст сообщения (`MessageText`). */
  children?: ReactNode;
  /** Вместо текста: поле редактирования. */
  editor?: ReactNode;
  /** Картинки под текстом. */
  attachments?: ReactNode;
  /** Реакции под текстом и картинками (`ReactionBar`). */
  reactions?: ReactNode;
  /** Панель действий при наведении (ответить, копировать, удалить, меню «⋯»). */
  tools?: ReactNode;
  className?: string;
};

const PROFILE_TRIGGER = { "data-profile-trigger": "", "aria-haspopup": "dialog" } as const;

/**
 * Сообщение чата. Раскладка и состояния; разметка текста (ссылки, упоминания, маска фильтра) —
 * в `MessageText`, картинки — в `MessageAttachments`.
 */
export function Message({
  author,
  avatar,
  time,
  roleBadge,
  status = "sent",
  onRetry,
  onDiscard,
  onAuthorPress,
  edited,
  continuation,
  children,
  editor,
  attachments,
  reactions,
  tools,
  className,
}: MessageProps) {
  const failed = status === "failed";
  return (
    <article
      className={cx(
        "group relative flex gap-3.5 px-4 hover:bg-white/[0.02] max-md:gap-2.5 max-md:px-3",
        // Тач: долгое нажатие открывает действия, а не системное выделение / меню ссылки.
        "touch:select-none touch:[-webkit-touch-callout:none]",
        continuation ? "py-px" : "py-2",
        status === "pending" && "opacity-60",
        className,
      )}
    >
      {continuation ? (
        <span className="w-10 shrink-0 self-center text-right font-label text-[9px] text-transparent group-hover:text-muted touch:invisible">
          {time}
        </span>
      ) : onAuthorPress ? (
        <button
          type="button"
          aria-label={`Профиль: ${author}`}
          {...PROFILE_TRIGGER}
          className="h-fit shrink-0 cursor-pointer outline-none focus-visible:[outline:var(--ds-focus-ring)] focus-visible:outline-offset-2"
          onClick={(event) => onAuthorPress(event.currentTarget)}
        >
          {avatar}
        </button>
      ) : (
        <div className="shrink-0">{avatar}</div>
      )}

      <div className="min-w-0 flex-1">
        {continuation ? null : (
          <header className="mb-0.5 flex flex-wrap items-baseline gap-2.5">
            {onAuthorPress ? (
              <button
                type="button"
                {...PROFILE_TRIGGER}
                className="min-w-0 cursor-pointer truncate text-sm font-semibold leading-snug text-fg outline-none hover:underline focus-visible:[outline:var(--ds-focus-ring)] focus-visible:outline-offset-2"
                onClick={(event) => onAuthorPress(event.currentTarget)}
              >
                {author}
              </button>
            ) : (
              <span className="text-sm font-semibold leading-snug text-fg">{author}</span>
            )}
            {roleBadge}
            {status === "pending" ? (
              <span className="font-label text-[9px] tracking-[0.06em] text-muted">отправляется…</span>
            ) : (
              <time className="font-label text-[9px] tracking-[0.06em] text-muted">{time}</time>
            )}
          </header>
        )}
        {editor ?? (
          <div
            className={cx(
              "select-text whitespace-pre-wrap break-words text-sm leading-relaxed touch:select-none max-md:text-[15px]",
              status === "deleted" ? "italic text-muted" : "text-[#e1dfea]",
              failed && "text-danger",
            )}
          >
            {children}
            {edited ? <span className="ml-2 text-[11px] text-muted">изменено</span> : null}
          </div>
        )}
        {attachments}
        {reactions}
        {failed ? (
          <div className="mt-1 flex items-center gap-3 text-[11px] text-danger">
            <span>Не отправлено</span>
            {onRetry ? (
              <Button variant="link" onPress={onRetry}>
                Повторить
              </Button>
            ) : null}
            {onDiscard ? (
              <Button variant="link" className="text-muted" onPress={onDiscard}>
                Удалить
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {tools ? (
        <div className="absolute right-3 top-1 hidden border border-line-strong bg-elevated group-focus-within:flex group-hover:flex has-[[aria-expanded=true]]:flex touch:hidden!">
          {tools}
        </div>
      ) : null}
    </article>
  );
}

/** Упоминание `@имя` внутри текста сообщения. */
export function Mention({ children }: { children: ReactNode }) {
  return <span className="bg-brand-soft px-1 text-brand-fg">{children}</span>;
}

/** Строка кода внутри текста сообщения. */
export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="border border-line bg-bg px-1.5 py-px font-label text-xs">{children}</code>;
}

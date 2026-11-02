import type { MouseEvent } from "react";
import type { MessageDto } from "@/shared/api/messages";
import { Icon, IconButton, Spinner, Tooltip } from "@/shared/ui";
import { MessageText } from "@/shared/ui/message-text/MessageText";
import { useDisplayName } from "@/stores/member-profile-store";
import { cx } from "@/utils/cx";

export type PinnedMessageBarProps = {
  message: MessageDto;
  /** Нет — сообщения нет ни в ленте, ни в недогруженной истории. */
  onJump?: () => void;
  /** Идёт догрузка истории до закреплённого — вместо пина крутится индикатор, клики игнорируются. */
  loading?: boolean;
  /** Только OWNER/ADMIN. */
  onUnpin?: () => void;
  onExternalLink: (url: string) => void;
};

/**
 * Плашка закреплённого сообщения под шапкой канала: текст в одну строку, длинный обрезается «…».
 * Клик по плашке — к сообщению в ленте; ссылки и кнопки внутри работают сами по себе.
 */
export function PinnedMessageBar({ message, onJump, loading = false, onUnpin, onExternalLink }: PinnedMessageBarProps) {
  const authorName = useDisplayName(message.author_id, message.author_username);
  // Переносы строк схлопываем, чтобы текст уместился в одну строку.
  const previewText = message.content.replace(/\s+/g, " ").trim();
  const hasText = previewText.length > 0;
  const imageCount = (message.attachments ?? []).length;

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (loading || (event.target instanceof Element && event.target.closest("button"))) {
      return;
    }
    onJump?.();
  }

  return (
    <div
      className={cx(
        "flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-2",
        onJump && !loading && "cursor-pointer hover:bg-elevated",
        loading && "cursor-progress",
      )}
      aria-busy={loading || undefined}
      title={onJump ? "Перейти к сообщению" : undefined}
      onClick={handleClick}
    >
      {loading ? (
        <Spinner size="sm" className="shrink-0" />
      ) : (
        <Icon name="pin" size="sm" className="shrink-0 text-accent" title="Закреплённое сообщение" />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-label text-[10px] uppercase tracking-[0.12em] text-muted">
          Закреплено · <span className="normal-case tracking-normal text-fg">{authorName}</span>
        </div>
        <div className="min-w-0 truncate text-fg">
          {hasText ? (
            <MessageText text={previewText} onExternalLink={onExternalLink} />
          ) : (
            <span className="text-muted">{imageCount > 1 ? `[картинки: ${imageCount}]` : "[картинка]"}</span>
          )}
        </div>
      </div>
      {onUnpin ? (
        <Tooltip content="Открепить" placement="bottom">
          <IconButton icon="close" label="Открепить" size="sm" className="shrink-0" onPress={onUnpin} />
        </Tooltip>
      ) : null}
    </div>
  );
}

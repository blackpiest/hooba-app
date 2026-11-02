import { memo, useState } from "react";
import type { MessageDto } from "@/shared/api/messages";
import { MessageAttachments } from "@/features/chat/attachments/MessageAttachments";
import { isTempRow, type ChatRow, type TempMessageRow } from "@/features/chat/message-history";
import { canSendMessageDraft, canonicalMessageLength } from "@/features/chat/message-content";
import { MessageComposer } from "@/features/chat/message-composer/MessageComposer";
import { ReactionPicker } from "@/features/chat/message-composer/EmojiPicker";
import { MessageReactions } from "@/features/chat/reactions/MessageReactions";
import { QuickReactions } from "@/features/chat/reactions/QuickReactions";
import { useIsTouch } from "@/hooks/use-breakpoint";
import { useLongPress } from "@/shared/lib/use-long-press";
import { sendDeleteMessage } from "@/shared/ws/app-realtime";
import { ContextMenu, Divider, DropdownMenu, IconButton, MenuItem, Message, Button, type MessageStatus } from "@/shared/ui";
import { MessageText } from "@/shared/ui/message-text/MessageText";
import { UserAvatar } from "@/shared/ui/user-avatar/UserAvatar";
import { UserBadgeMark } from "@/shared/ui/user-avatar/UserBadgeMark";
import { useDisplayName, useMemberProfile } from "@/stores/member-profile-store";
import { toggleProfileCard } from "@/widgets/user-profile-card";
import {
  copyMessageText,
  messageClock,
  messageDayLabel,
  messageStamp,
  messageWasEdited,
} from "./message-format";

export type Moderator = "owner" | "admin" | null;

export type MessageRowProps = {
  row: ChatRow;
  grouped: boolean;
  newDay: boolean;
  own: boolean;
  editing: boolean;
  editDraft: string;
  onEditDraftChange: (next: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit: () => void;
  /** Нет — правка недоступна (роль запрещает писать). */
  onStartEdit?: (row: MessageDto) => void;
  onExternalLink: (url: string) => void;
  onRetry: (row: TempMessageRow) => void;
  onDiscard: (tempId: string) => void;
  /** Роль смотрящего: можно ли удалять чужие сообщения. */
  moderator: Moderator;
  /** Удаление чужого — через подтверждение. */
  onRequestDelete: (message: MessageDto) => void;
  /** Это сообщение сейчас закреплено в канале. */
  pinned: boolean;
  /** Нет — смотрящий не OWNER/ADMIN, закреплять нельзя. */
  onTogglePin?: (message: MessageDto, pinned: boolean) => void;
  viewerId: number | null;
  /** Право канала ставить реакции; без него свои реакции всё равно снимаются. */
  canReact: boolean;
  onToggleReaction: (message: MessageDto, emoji: string, on: boolean) => void;
};

/** Все колбэки стабильны, поэтому строка перерисовывается только при изменении своих данных. */
export const MessageRow = memo(function MessageRow({
  row: r,
  grouped,
  newDay,
  own,
  editing,
  editDraft,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onExternalLink,
  onRetry,
  onDiscard,
  moderator,
  onRequestDelete,
  pinned,
  onTogglePin,
  viewerId,
  canReact,
  onToggleReaction,
}: MessageRowProps) {
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null);
  const isTouch = useIsTouch();
  const temp = isTempRow(r) ? r : null;
  const message = isTempRow(r) ? null : r;
  const time = new Date(r.created_at);
  const validTime = !Number.isNaN(time.getTime());
  const stamp = validTime ? messageStamp(time) : "";
  const clock = validTime ? messageClock(time) : "";
  const saveEdit = () => onSaveEdit?.();
  const attachments = r.attachments ?? [];
  const hasLiveAttachments = attachments.some((item) => !item.purged);
  const authorName = useDisplayName(r.author_id, r.author_username);
  const authorRoles = useMemberProfile(r.author_id)?.roles;
  const authorIsStaff = Boolean(authorRoles?.includes("OWNER") || authorRoles?.includes("ADMIN"));
  const canModerate = !own && (moderator === "owner" || (moderator === "admin" && !authorIsStaff));

  // Пункты меню сообщения; у сообщения только из картинок нет «Копировать текст».
  const copyAction =
    message && message.content.trim().length > 0 ? () => void copyMessageText(message.content) : undefined;
  const editAction = message && own && onStartEdit ? () => onStartEdit(message) : undefined;
  const deleteAction = !message
    ? undefined
    : own
      ? () => sendDeleteMessage(message.id)
      : canModerate
        ? () => onRequestDelete(message)
        : undefined;
  const pinAction = message && onTogglePin ? () => onTogglePin(message, pinned) : undefined;
  /** Нет ни одного пункта — нет ни «…», ни меню по ПКМ. */
  const hasActions = Boolean(copyAction || editAction || pinAction || deleteAction);
  const reactAction =
    message && canReact && !message.is_deleted
      ? (emoji: string) => onToggleReaction(message, emoji, true)
      : undefined;
  const reactions = message?.reactions ?? [];

  function runAction(key: string | number) {
    if (key === "edit") {
      editAction?.();
    } else if (key === "copy") {
      copyAction?.();
    } else if (key === "pin") {
      pinAction?.();
    } else if (key === "delete") {
      deleteAction?.();
    }
  }

  const items = (
    <>
      {editAction ? (
        <MenuItem id="edit" icon="edit">
          Изменить
        </MenuItem>
      ) : null}
      {copyAction ? (
        <MenuItem id="copy" icon="copy">
          Копировать текст
        </MenuItem>
      ) : null}
      {pinAction ? (
        <MenuItem id="pin" icon="pin">
          {pinned ? "Открепить" : "Закрепить"}
        </MenuItem>
      ) : null}
      {deleteAction ? (
        <MenuItem id="delete" icon="trash" danger>
          Удалить
        </MenuItem>
      ) : null}
    </>
  );

  // Тач: долгое нажатие вместо ПКМ и панели при наведении — шторка с быстрыми реакциями и теми же пунктами.
  const longPress = useLongPress((point) => setContextPoint(point), {
    enabled: isTouch && Boolean(message) && !editing && (hasActions || Boolean(reactAction)),
  });

  const status: MessageStatus = temp ? (temp.failed ? "failed" : "pending") : "sent";
  const showText = r.content.length > 0 || attachments.length === 0;

  return (
    <div data-message-id={message?.id}>
      {newDay ? <Divider label={messageDayLabel(time)} className="my-3 px-2" /> : null}
      <div
        {...longPress}
        onContextMenu={
          message && !editing && (hasActions || (isTouch && reactAction))
            ? (event) => {
                event.preventDefault();
                setContextPoint({ x: event.clientX, y: event.clientY });
              }
            : undefined
        }
      >
        <Message
          author={authorName}
          avatar={<UserAvatar userId={r.author_id} name={authorName} size="lg" />}
          roleBadge={r.author_id > 0 ? <UserBadgeMark userId={r.author_id} /> : undefined}
          time={grouped ? clock : stamp}
          continuation={grouped}
          status={status}
          onRetry={temp ? () => onRetry(temp) : undefined}
          onDiscard={temp ? () => onDiscard(temp.tempId) : undefined}
          onAuthorPress={
            r.author_id > 0 ? (anchor) => toggleProfileCard(r.author_id, r.author_username, anchor, "right") : undefined
          }
          edited={Boolean(message && messageWasEdited(message))}
          attachments={attachments.length > 0 ? <MessageAttachments attachments={attachments} /> : undefined}
          reactions={
            message && reactions.length > 0 ? (
              <MessageReactions
                reactions={reactions}
                viewerId={viewerId}
                canReact={canReact}
                onToggle={(emoji, on) => onToggleReaction(message, emoji, on)}
              />
            ) : undefined
          }
          tools={
            message && !editing && (hasActions || reactAction) ? (
              <>
                {reactAction ? (
                  <ReactionPicker
                    onPick={reactAction}
                    trigger={<IconButton icon="smile" label="Добавить реакцию" size="sm" />}
                  />
                ) : null}
                {hasActions ? (
                  <DropdownMenu
                    aria-label="Действия с сообщением"
                    placement="bottom end"
                    onAction={runAction}
                    trigger={<IconButton icon="more-h" label="Действия с сообщением" size="sm" />}
                  >
                    {items}
                  </DropdownMenu>
                ) : null}
              </>
            ) : undefined
          }
          editor={
            editing ? (
              <form
                className="mt-1 flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveEdit();
                }}
              >
                <MessageComposer
                  value={editDraft}
                  onValueChange={onEditDraftChange}
                  onSubmit={saveEdit}
                  onEscape={onCancelEdit}
                  allowEmpty={hasLiveAttachments}
                />
                <Button
                  type="submit"
                  size="sm"
                  leadingIcon="check"
                  aria-label="Сохранить"
                  isDisabled={
                    !canSendMessageDraft(editDraft) && !(hasLiveAttachments && canonicalMessageLength(editDraft) === 0)
                  }
                />
                <IconButton icon="close" label="Отмена" variant="solid" onPress={onCancelEdit} />
              </form>
            ) : undefined
          }
        >
          {showText ? <MessageText text={r.content} onExternalLink={onExternalLink} /> : null}
        </Message>
      </div>
      {contextPoint ? (
        <ContextMenu
          x={contextPoint.x}
          y={contextPoint.y}
          aria-label="Действия с сообщением"
          onClose={() => setContextPoint(null)}
          onAction={runAction}
          header={
            isTouch ? (
              <div className="flex flex-col gap-2">
                <p className="font-label text-[10px] uppercase tracking-[0.08em] text-muted">
                  {authorName} · {stamp}
                </p>
                {reactAction ? (
                  <QuickReactions
                    onPick={(key) => {
                      reactAction(key);
                      setContextPoint(null);
                    }}
                  />
                ) : null}
              </div>
            ) : undefined
          }
        >
          {items}
        </ContextMenu>
      ) : null}
    </div>
  );
});

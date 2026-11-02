import {
  customEmojiById,
  emojiNameByChar,
  reactionDisplayChar,
  useCustomEmojiVersion,
} from "@/features/chat/emoji/registry";
import { ReactionPicker } from "@/features/chat/message-composer/EmojiPicker";
import type { ReactionDto } from "@/shared/api/messages";
import { IconButton, ReactionBar, ReactionChip, ReactionDetails, ReactionPerson } from "@/shared/ui";
import { UserAvatar } from "@/shared/ui/user-avatar/UserAvatar";
import { useDisplayName } from "@/stores/member-profile-store";

/** Сколько людей показывать в карточке реакции; остальные — «и ещё N отреагировало». */
const PEOPLE_IN_DETAILS = 5;

function ReactionEmoji({ reaction, large = false }: { reaction: ReactionDto; large?: boolean }) {
  if (reaction.custom_emoji_id === null) {
    return <>{reactionDisplayChar(reaction.emoji)}</>;
  }
  const entry = customEmojiById(String(reaction.custom_emoji_id));
  return entry?.imageUrl ? (
    <img src={entry.imageUrl} alt="" className={large ? "size-10 object-contain" : "size-4 object-contain"} draggable={false} />
  ) : (
    <>?</>
  );
}

function reactionTitle(reaction: ReactionDto): string {
  if (reaction.custom_emoji_id !== null) {
    const name = customEmojiById(String(reaction.custom_emoji_id))?.name;
    return name ? `:${name}:` : "реакция";
  }
  const name = emojiNameByChar(reaction.emoji);
  return name ? `:${name}:` : reactionDisplayChar(reaction.emoji);
}

function Person({ userId }: { userId: number }) {
  const name = useDisplayName(userId, "участник");
  return <ReactionPerson avatar={<UserAvatar userId={userId} name={name} size="sm" />} name={name} />;
}

/** Реакции сообщения. `canReact = false` — только просмотр, своя реакция всё равно снимается. */
export function MessageReactions({
  reactions,
  viewerId,
  canReact,
  onToggle,
}: {
  reactions: ReactionDto[];
  viewerId: number | null;
  canReact: boolean;
  onToggle: (emoji: string, on: boolean) => void;
}) {
  // Картинки своих реакций могли прийти позже сообщения.
  useCustomEmojiVersion();
  if (reactions.length === 0) {
    return null;
  }
  return (
    <ReactionBar>
      {reactions.map((reaction) => {
        const mine = viewerId !== null && reaction.user_ids.includes(viewerId);
        const title = reactionTitle(reaction);
        const shown = reaction.user_ids.slice(0, PEOPLE_IN_DETAILS);
        return (
          <ReactionChip
            key={reaction.emoji}
            aria-label={`${title}: ${reaction.count}`}
            emoji={<ReactionEmoji reaction={reaction} />}
            count={reaction.count}
            active={mine}
            details={
              <ReactionDetails
                emoji={<ReactionEmoji reaction={reaction} large />}
                title={title}
                people={shown.map((userId) => (
                  <Person key={userId} userId={userId} />
                ))}
                more={reaction.count - shown.length}
              />
            }
            onPress={mine || canReact ? () => onToggle(reaction.emoji, !mine) : undefined}
          />
        );
      })}
      {canReact ? (
        <ReactionPicker
          onPick={(emoji) => onToggle(emoji, true)}
          trigger={<IconButton icon="plus" label="Добавить реакцию" size="xs" />}
        />
      ) : null}
    </ReactionBar>
  );
}

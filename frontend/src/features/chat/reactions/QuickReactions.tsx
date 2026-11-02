import { useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { listRecentEmojis, rememberRecentEmoji } from "@/features/chat/emoji/recent-emojis";
import { emojiByName, emojiNameByChar, reactionKeyOf, type EmojiEntry } from "@/features/chat/emoji/registry";
import { ReactionPicker } from "@/features/chat/message-composer/EmojiPicker";
import { IconButton } from "@/shared/ui";

const QUICK_COUNT = 6;
const DEFAULT_QUICK = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

/** Недавние реакции, добитые стандартным набором до QUICK_COUNT. */
function quickEntries(): EmojiEntry[] {
  const entries = listRecentEmojis(true).slice(0, QUICK_COUNT);
  const keys = new Set(entries.map(reactionKeyOf));
  for (const char of DEFAULT_QUICK) {
    if (entries.length >= QUICK_COUNT) break;
    const name = emojiNameByChar(char);
    const entry = name ? emojiByName(name) : undefined;
    if (entry && !keys.has(reactionKeyOf(entry))) {
      entries.push(entry);
      keys.add(reactionKeyOf(entry));
    }
  }
  return entries;
}

/**
 * Строка быстрых реакций в шторке сообщения (тач): недавние + «ещё» с полным выбором.
 * `onPick` получает ключ реакции и закрывает шторку.
 */
export function QuickReactions({ onPick }: { onPick: (key: string) => void }) {
  const [entries] = useState(quickEntries);
  return (
    <div className="flex items-center justify-between gap-1">
      {entries.map((entry) => {
        const key = reactionKeyOf(entry);
        if (!key) return null;
        return (
          <AriaButton
            key={key}
            aria-label={`:${entry.name}:`}
            className="ds-focus flex size-11 cursor-pointer items-center justify-center text-2xl leading-none outline-none data-[pressed]:bg-brand-soft"
            onPress={() => {
              rememberRecentEmoji(entry);
              onPick(key);
            }}
          >
            {entry.char ? entry.char : entry.imageUrl ? <img src={entry.imageUrl} alt="" className="size-7 object-contain" draggable={false} /> : null}
          </AriaButton>
        );
      })}
      <ReactionPicker onPick={onPick} trigger={<IconButton icon="plus" label="Другие реакции" />} />
    </div>
  );
}

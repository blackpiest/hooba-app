import { useState, type ReactElement } from "react";
import { Button as AriaButton } from "react-aria-components";
import {
  emojiCategories,
  emojiInsertText,
  listCustomEmojis,
  reactionKeyOf,
  useCustomEmojiVersion,
  type EmojiCategory,
  type EmojiEntry,
} from "@/features/chat/emoji/registry";
import { listRecentEmojis, rememberRecentEmoji } from "@/features/chat/emoji/recent-emojis";
import { Button, IconButton, Popover, TextField } from "@/shared/ui";

function EmojiCell({ entry, onPick }: { entry: EmojiEntry; onPick: (entry: EmojiEntry) => void }) {
  if (!emojiInsertText(entry)) {
    return null;
  }
  return (
    <AriaButton
      aria-label={`:${entry.name}:`}
      className="ds-focus flex size-9 cursor-pointer items-center justify-center text-xl leading-none outline-none data-[hovered]:bg-elevated max-md:size-11 max-md:text-2xl"
      onPress={() => onPick(entry)}
    >
      {entry.char ? (
        entry.char
      ) : entry.imageUrl ? (
        <img src={entry.imageUrl} alt="" className="size-6 object-contain" draggable={false} />
      ) : null}
    </AriaButton>
  );
}

function EmojiGrid({ entries, onPick }: { entries: EmojiEntry[]; onPick: (entry: EmojiEntry) => void }) {
  return (
    <div className="grid grid-cols-8 max-md:grid-cols-[repeat(auto-fill,minmax(44px,1fr))]">
      {entries.map((entry) => (
        <EmojiCell key={entry.id ?? entry.name} entry={entry} onPick={onPick} />
      ))}
    </div>
  );
}

const RECENT_CATEGORY_ID = -2;

/**
 * Поиск, категории и сетка. Первой — «Недавние» (если есть), `withCustom` — смайлики сообщества категорией
 * «Специальные» (только для реакций). Недавние читаются при открытии, чтобы сетка не прыгала при выборе.
 */
function EmojiPickerPanel({ onPick, withCustom }: { onPick: (entry: EmojiEntry) => void; withCustom: boolean }) {
  const [query, setQuery] = useState("");
  useCustomEmojiVersion();
  const [recent] = useState(() => listRecentEmojis(withCustom));
  const custom = withCustom ? listCustomEmojis() : [];
  const categories: EmojiCategory[] = [
    ...(recent.length > 0 ? [{ id: RECENT_CATEGORY_ID, label: "Недавние", emojis: recent }] : []),
    ...(custom.length > 0 ? [{ id: -1, label: "Специальные", emojis: custom }] : []),
    ...emojiCategories,
  ];
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 0);
  const active = categories.find((category) => category.id === categoryId) ?? categories[0];
  const pick = (entry: EmojiEntry) => {
    rememberRecentEmoji(entry);
    onPick(entry);
  };
  const normalizedQuery = query.trim().toLowerCase();
  const results = normalizedQuery
    ? categories
        .filter((category) => category.id !== RECENT_CATEGORY_ID)
        .flatMap((category) => category.emojis)
        .filter(
          (entry) =>
            entry.name.includes(normalizedQuery) || entry.keywords.some((keyword) => keyword.includes(normalizedQuery)),
        )
        .slice(0, 250)
    : [];

  return (
    <>
      <TextField
        aria-label="Поиск эмодзи"
        className="mb-2"
        value={query}
        onChange={setQuery}
        placeholder="Поиск эмодзи"
        leadingIcon="search"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
          }
        }}
      />
      <div className="mb-1 flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden py-0.5">
        {categories.map((category) => (
          <Button
            key={category.id}
            size="sm"
            variant={!normalizedQuery && category.id === active?.id ? "secondary" : "ghost"}
            className="shrink-0 px-2"
            onPress={() => {
              setCategoryId(category.id);
              setQuery("");
            }}
          >
            {category.label}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {normalizedQuery ? (
          results.length > 0 ? (
            <EmojiGrid entries={results} onPick={pick} />
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted">Ничего не найдено</p>
          )
        ) : active ? (
          <>
            <p className="px-1 py-1 font-label text-[10px] uppercase tracking-[0.1em] text-muted">{active.label}</p>
            <EmojiGrid entries={active.emojis} onPick={pick} />
          </>
        ) : null}
      </div>
    </>
  );
}

const PANEL_CLASS = "flex max-h-[min(360px,60vh)] w-80 flex-col p-2 max-md:h-[min(420px,55dvh)] max-md:max-h-none max-md:w-full";

/** Кнопка «эмодзи» и панель выбора с поиском и категориями. Панель остаётся открытой, пока не нажат Esc или клик снаружи. */
export function EmojiPickerButton({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="absolute bottom-[5px] right-1.5">
      <Popover
        aria-label="Эмодзи"
        placement="top end"
        className={PANEL_CLASS}
        mobileSheet
        trigger={<IconButton icon="smile" label="Эмодзи" />}
      >
        <EmojiPickerPanel
          withCustom={false}
          onPick={(entry) => {
            const text = emojiInsertText(entry);
            if (text) onPick(text);
          }}
        />
      </Popover>
    </div>
  );
}

/** Выбор реакции: та же панель плюс смайлики сообщества, закрывается после выбора. */
export function ReactionPicker({
  trigger,
  onPick,
}: {
  trigger: ReactElement;
  onPick: (key: string) => void;
}) {
  return (
    <Popover aria-label="Реакция" placement="bottom end" className={PANEL_CLASS} trigger={trigger} mobileSheet>
      {({ close }) => (
        <EmojiPickerPanel
          withCustom
          onPick={(entry) => {
            const key = reactionKeyOf(entry);
            if (key) onPick(key);
            close();
          }}
        />
      )}
    </Popover>
  );
}

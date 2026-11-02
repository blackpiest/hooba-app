import { create } from "zustand";
import { fetchCustomEmojis, type CustomEmojiDto } from "@/shared/api/emojis";
import { apiUrl } from "@/shared/api/http";
import { registerCustomEmojis } from "@/features/chat/emoji/registry";
import { getSessionEpoch, registerSessionClear } from "@/shared/lib/session-reset";

type State = {
  /** Смайлики сообщества по порядку загрузки. */
  emojis: CustomEmojiDto[];
  load: () => Promise<void>;
  /** Ответ сервера после загрузки/правки владельцем — не ждать WS `emoji:list_changed`. */
  set: (emojis: CustomEmojiDto[]) => void;
  clear: () => void;
};

function publish(emojis: CustomEmojiDto[]) {
  registerCustomEmojis(
    emojis.map((emoji) => ({
      id: String(emoji.id),
      name: emoji.name,
      imageUrl: apiUrl(emoji.url),
      category: "Специальные",
      keywords: [],
    })),
  );
}

export const useEmojiStore = create<State>((setState) => ({
  emojis: [],
  load: async () => {
    const epoch = getSessionEpoch();
    try {
      const emojis = await fetchCustomEmojis();
      if (epoch === getSessionEpoch()) {
        publish(emojis);
        setState({ emojis });
      }
    } catch {
      /* не критично: токены покажутся как :name:, список перечитается при переподключении */
    }
  },
  set: (emojis) => {
    publish(emojis);
    setState({ emojis });
  },
  clear: () => {
    publish([]);
    setState({ emojis: [] });
  },
}));

registerSessionClear(() => useEmojiStore.getState().clear());

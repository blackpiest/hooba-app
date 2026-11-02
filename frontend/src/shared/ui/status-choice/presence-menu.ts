import type { PresencePreference } from "@/shared/presence";

export type PresenceMenuItem = { id: PresencePreference; label: string; hint?: string; dot: string };

/** Пункты выбора своего статуса (плашка пользователя, карточка профиля). Первый — «В сети», дальше отделяется разделителем. */
export const PRESENCE_MENU: readonly PresenceMenuItem[] = [
  { id: "online", label: "В сети", dot: "bg-presence-online" },
  { id: "idle", label: "Отошёл", dot: "bg-presence-idle" },
  {
    id: "dnd",
    label: "Не беспокоить",
    hint: "Звук новых сообщений не проигрывается",
    dot: "bg-presence-dnd",
  },
  {
    id: "invisible",
    label: "Невидимка",
    hint: "У вас будет статус «Не в сети»",
    dot: "bg-presence-offline",
  },
];

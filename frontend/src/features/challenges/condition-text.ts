import type { Condition, ConditionType, CosmeticKind, LocalHour } from "@/shared/api/challenges";

/** Склонение по числу: 1 сообщение, 2 сообщения, 5 сообщений. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Минуты по-человечески: «45 мин», «3 ч», «2 ч 30 мин». */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} мин`;
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
}

/** `2026-10-31T20:00` → «31.10.2026 20:00». */
export function formatLocalHour(value: LocalHour): string {
  const [date = "", time = ""] = value.split("T");
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y} ${time}`;
}

/**
 * Ввод владельца «31.10.2026 20:00» (или «31.10.2026 20», «31.10.2026» — полночь) → `2026-10-31T20:00`.
 * Точность — час (копилки активности почасовые); минуты, отличные от 00, — ошибка, если не `anyMinute`
 * (объявления). Пустая строка — null.
 */
export function parseLocalHour(input: string, { anyMinute = false }: { anyMinute?: boolean } = {}): LocalHour | null | "invalid" {
  const text = input.trim();
  if (!text) return null;
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?)?$/.exec(text);
  if (!match) return "invalid";
  const [, d, m, y, h = "0", min = "00"] = match;
  const day = Number(d);
  const month = Number(m);
  const hour = Number(h);
  if ((!anyMinute && min !== "00") || Number(min) > 59 || month < 1 || month > 12 || day < 1 || hour > 23) return "invalid";
  const probe = new Date(Date.UTC(Number(y), month - 1, day));
  if (probe.getUTCMonth() !== month - 1) return "invalid";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(month)}-${pad(day)}T${pad(hour)}:${min}`;
}

export const CONDITION_LABEL: Record<ConditionType, string> = {
  messages: "Сообщения",
  voice_minutes: "Время в голосе",
  game_minutes: "Время в игре",
  online_minutes: "Онлайн в событие",
  active_days: "Дни активности",
  streak_days: "Дни подряд",
  invites_joined: "Приглашения",
  has_cosmetic: "Есть предмет",
  challenge_done: "Другое испытание",
};

export const COSMETIC_KIND_LABEL: Record<CosmeticKind, string> = {
  badge: "значок",
  title: "титул",
  frame: "рамка",
  background: "фон",
  character: "персонаж",
};

/** Имена для ссылок условий: каналы, предметы, испытания. Нет имени — показывается id. */
export type ConditionNames = {
  channel?: (id: number) => string | undefined;
  cosmetic?: (kind: CosmeticKind, id: string) => string | undefined;
  challenge?: (id: number) => string | undefined;
};

function periodText(condition: { from?: LocalHour; to?: LocalHour }): string {
  if (condition.from && condition.to) return ` с ${formatLocalHour(condition.from)} до ${formatLocalHour(condition.to)}`;
  if (condition.from) return ` начиная с ${formatLocalHour(condition.from)}`;
  if (condition.to) return ` до ${formatLocalHour(condition.to)}`;
  return "";
}

function channelsText(ids: number[] | undefined, names: ConditionNames): string {
  if (!ids?.length) return "";
  const list = ids.map((id) => `#${names.channel?.(id) ?? id}`).join(", ");
  return ` в ${list}`;
}

/** Условие одной фразой: «Отправить 100 сообщений в #общий», «Провести 5 ч в голосовых каналах». */
export function describeCondition(condition: Condition, names: ConditionNames = {}): string {
  switch (condition.type) {
    case "messages":
      return `Отправить ${condition.count} ${plural(condition.count, "сообщение", "сообщения", "сообщений")}${channelsText(condition.channel_ids, names)}${periodText(condition)}`;
    case "voice_minutes":
      return `Провести ${formatMinutes(condition.minutes)} в ${condition.channel_ids?.length ? `голосе${channelsText(condition.channel_ids, names)}` : "голосовых каналах"}${periodText(condition)}`;
    case "game_minutes":
      return `Наиграть ${formatMinutes(condition.minutes)}${condition.games?.length ? ` в ${condition.games.join(", ")}` : " в любые игры"}${periodText(condition)}`;
    case "online_minutes":
      return `Быть онлайн ${formatMinutes(condition.minutes)}${periodText(condition)}`;
    case "active_days":
      return `Заходить ${condition.days} ${plural(condition.days, "день", "дня", "дней")}${periodText(condition)}`;
    case "streak_days":
      return `Заходить ${condition.days} ${plural(condition.days, "день", "дня", "дней")} подряд`;
    case "invites_joined":
      return `Пригласить ${condition.count} ${plural(condition.count, "участника", "участников", "участников")}`;
    case "has_cosmetic":
      return `Получить ${COSMETIC_KIND_LABEL[condition.kind]} «${names.cosmetic?.(condition.kind, condition.item_id) ?? condition.item_id}»`;
    case "challenge_done":
      return `Выполнить испытание «${names.challenge?.(condition.challenge_id) ?? condition.challenge_id}»`;
  }
}

/** Прогресс условия: «72 / 100», «3 ч / 5 ч», «2 / 3 дня». Да/нет-условия — «выполнено» / «нет». */
export function formatProgress(condition: Condition, current: number, target: number): string {
  switch (condition.type) {
    case "voice_minutes":
    case "game_minutes":
    case "online_minutes":
      return `${formatMinutes(current)} / ${formatMinutes(target)}`;
    case "active_days":
    case "streak_days":
      return `${current} / ${target} ${plural(target, "дня", "дней", "дней")}`;
    case "has_cosmetic":
    case "challenge_done":
      return current >= target ? "выполнено" : "нет";
    default:
      return `${current} / ${target}`;
  }
}

/** Подсказка, как считается условие, — чтобы правила накрутки не были сюрпризом. */
export const CONDITION_HINT: Partial<Record<ConditionType, string>> = {
  messages: "Считаются сообщения хотя бы из 2 букв или с картинкой, не чаще одного в 5 секунд.",
  voice_minutes: "Считается время, когда в канале есть кто-то ещё и звук не выключен.",
  game_minutes: "Считается игра, которую видят другие: нужно включить «показывать, во что играю» и не быть невидимкой.",
  online_minutes: "Статус «В сети» или «Не беспокоить». Точность — час.",
  active_days: "День засчитан, если в нём была любая активность. Дни — по часовому поясу сервера.",
  streak_days: "Лучшая серия подряд идущих активных дней по часовому поясу сервера.",
  invites_joined: "Участники, зарегистрировавшиеся по личным кодам и оставшиеся в сообществе.",
};

import type { MessageDto } from "@/shared/api/messages";

const messageDayFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function messageDayLabel(date: Date, now = new Date()): string {
  if (sameLocalDay(date, now)) {
    return "Сегодня";
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameLocalDay(date, yesterday)) {
    return "Вчера";
  }
  return messageDayFormat.format(date);
}

const pad = (value: number) => String(value).padStart(2, "0");

export { messageStamp } from "@/shared/lib/date-format";

export function messageClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function messageWasEdited(row: MessageDto): boolean {
  const created = Date.parse(row.created_at);
  const updated = Date.parse(row.updated_at);
  return Number.isFinite(created) && Number.isFinite(updated) && updated - created >= 1000;
}

export async function copyMessageText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

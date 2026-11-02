/**
 * Сейчас по часам сообщества в формате окон испытаний (`YYYY-MM-DDTHH:mm`). Строки сравниваются
 * лексикографически: `starts_at <= now < ends_at`.
 */
export function localNow(timezone: string, at: Date = new Date()): string {
  // sv-SE даёт `2026-10-31 20:15` — ISO-подобный порядок полей.
  const text = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  return text.replace(' ', 'T');
}

/** Окно испытания открыто: начало прошло, конец не наступил. */
export function windowOpen(window: { from: string | null; to: string | null }, now: string): boolean {
  return (!window.from || window.from <= now) && (!window.to || now < window.to);
}

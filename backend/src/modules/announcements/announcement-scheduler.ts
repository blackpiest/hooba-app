import { deliverDueAnnouncements } from './announcements.service.js';

/** Запас после начала минуты: дата объявления — с точностью до минуты, проверяем сразу после её наступления. */
const MINUTE_SLACK_MS = 500;

/** Сколько ждать до начала следующей минуты (+ запас). Пояса сдвинуты на целые минуты — граница общая. */
export function msUntilNextMinute(nowMs: number): number {
  return 60_000 - (nowMs % 60_000) + MINUTE_SLACK_MS;
}

/**
 * В начале каждой минуты показывает объявления, чья дата наступила; при старте — всё, что пропущено,
 * пока сервер лежал. Ошибка прогона не останавливает таймер.
 */
export function startAnnouncementScheduler(onError: (error: unknown) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    void deliverDueAnnouncements().catch(onError);
    timer = setTimeout(tick, msUntilNextMinute(Date.now()));
    timer.unref();
  };
  tick();
  return () => {
    if (timer) clearTimeout(timer);
  };
}

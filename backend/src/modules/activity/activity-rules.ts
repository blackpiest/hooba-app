/**
 * Что засчитывается в копилки активности (испытания). Правила в одном месте, без БД и таймеров —
 * чтобы их можно было проверить тестами и объяснить участникам одной фразой.
 */

/** Минимум значимых символов (буквы, цифры), чтобы сообщение без картинки засчиталось. */
export const MESSAGE_MIN_SIGNIFICANT = 2;
/** С одного участника засчитывается не больше одного сообщения за этот интервал. */
export const MESSAGE_THROTTLE_MS = 5_000;

/** Сообщение засчитывается, если в нём хватает букв/цифр или есть картинка. «+», «.», «)))» — нет. */
export function messageCounts(content: string, hasAttachments: boolean): boolean {
  if (hasAttachments) {
    return true;
  }
  const significant = content.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return significant >= MESSAGE_MIN_SIGNIFICANT;
}

/** Последнее засчитанное сообщение по пользователю: поток коротких сообщений даёт одно очко в 5 секунд. */
export class MessageThrottle {
  private readonly lastAt = new Map<number, number>();

  constructor(private readonly intervalMs = MESSAGE_THROTTLE_MS) {}

  take(userId: number, now: number): boolean {
    const last = this.lastAt.get(userId);
    if (last !== undefined && now - last < this.intervalMs) {
      return false;
    }
    this.lastAt.set(userId, now);
    return true;
  }
}

/**
 * Минута в голосе засчитывается, если в комнате есть кто-то ещё и участник не выключил себе звук.
 * Сидеть одному или AFK с заглушёнными динамиками — не общение.
 */
export function voiceMinuteCounts(participant: { deafened: boolean }, roomSize: number): boolean {
  return roomSize >= 2 && !participant.deafened;
}

/** Начало часа (UTC), к которому относится момент: ключ копилки. */
export function hourStart(at: number): Date {
  return new Date(Math.floor(at / 3_600_000) * 3_600_000);
}

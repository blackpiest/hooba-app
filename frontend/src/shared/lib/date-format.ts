const pad = (value: number) => String(value).padStart(2, "0");

/** `ДД.ММ.ГГГГ ЧЧ:ММ` в локальном времени. */
export function messageStamp(date: Date): string {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

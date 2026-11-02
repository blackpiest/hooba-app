/** Своя игра из каталога запущена (локальный опрос процессов, только Windows-десктоп). На сервер не уходит. */
let selfGameRunning = false;

export function isSelfGameRunning(): boolean {
  return selfGameRunning;
}

export function setSelfGameRunning(running: boolean): void {
  selfGameRunning = running;
}

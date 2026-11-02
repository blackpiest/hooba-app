/**
 * Короткие звуки на сенсорных устройствах (прежде всего iPhone). `new Audio().play()` там ненадёжен:
 * без свежего нажатия Safari молча отказывает (звук сообщения «то есть, то нет»), а у каждого нового
 * элемента своя задержка старта — два одинаковых клипа подряд звучат эхом.
 *
 * Здесь один AudioContext на страницу: он разблокируется первым касанием и дальше играет без жеста,
 * файлы декодируются один раз. Десктоп этим не пользуется — там свой путь с выбором устройства вывода.
 * Учтите: на iPhone Web Audio подчиняется переключателю «Без звука», как и звуки нативных приложений.
 */

const RESUME_WAIT_MS = 300;

let context: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function ensureContext(): AudioContext | null {
  if (context && context.state !== "closed") {
    return context;
  }
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  try {
    context = new Ctx();
  } catch {
    context = null;
  }
  return context;
}

/** iOS снимает блокировку только внутри жеста: resume + пустой буфер на каждом нажатии, пока не заработает. */
function unlock(): void {
  const ctx = ensureContext();
  if (!ctx || ctx.state === "running") {
    return;
  }
  void ctx.resume().catch(() => {});
  try {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.start();
  } catch {
    /* контекст ещё не готов — попробуем на следующем нажатии */
  }
}

let unlockInstalled = false;

/** Вешает разблокировку на нажатия. Вызывается при первом звуке и при старте приложения. */
export function installTouchSoundUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") {
    return;
  }
  unlockInstalled = true;
  for (const type of ["touchend", "pointerup", "click", "keydown"]) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  }
}

function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  let pending = buffers.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(
        (data) =>
          // Колбэчная форма: старый Safari не возвращает промис из decodeAudioData.
          new Promise<AudioBuffer>((resolve, reject) => {
            ctx.decodeAudioData(data, resolve, reject);
          }),
      )
      .catch(() => {
        buffers.delete(url);
        return null;
      });
    buffers.set(url, pending);
  }
  return pending;
}

/** Проиграть клип с громкостью `gain` (0…1). Без разблокировки (ни одного нажатия) — тихо пропускает. */
export async function playTouchClip(url: string, gain: number): Promise<void> {
  installTouchSoundUnlock();
  const ctx = ensureContext();
  if (!ctx) {
    return;
  }
  const running =
    ctx.state === "running"
      ? Promise.resolve(true)
      : // Внутри жеста (открытие профиля) это и есть разблокировка. Вне жеста iOS держит resume() висящим
        // до следующего нажатия — ждём недолго и пропускаем, чтобы звук не прозвучал невпопад позже.
        (unlock(),
        Promise.race([
          ctx.resume().then(
            () => true,
            () => false,
          ),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), RESUME_WAIT_MS)),
        ]));
  const [buffer, ready] = await Promise.all([loadBuffer(ctx, url), running]);
  if (!buffer || !ready || ctx.state !== "running") {
    return;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const volume = ctx.createGain();
  volume.gain.value = Math.max(0, Math.min(1, gain));
  source.connect(volume);
  volume.connect(ctx.destination);
  source.start();
}

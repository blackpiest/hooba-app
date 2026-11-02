/** Лендинг со скачиванием приложения; `ref` — откуда пришли (`web_login`, `web_reg`). */
export function buildLandingUrl(ref: string): string {
  return `https://hooba.space/?ref=${encodeURIComponent(ref)}`;
}

/** Сколько ждём, что браузер отдаст ссылку приложению, прежде чем счесть его неустановленным. */
const APP_OPEN_TIMEOUT_MS = 1500;

/**
 * Пробует открыть установленное приложение по `hooba://…`. Браузер не сообщает, нашёлся ли обработчик схемы:
 * если страница за таймаут не ушла в фон (диалог «Открыть приложение?», само приложение), уводим на лендинг.
 */
export function openDesktopAppOrLanding(appLink: string, landingUrl: string): void {
  let left = false;
  const markLeft = () => {
    left = true;
  };
  const onVisibility = () => {
    if (document.hidden) {
      markLeft();
    }
  };
  window.addEventListener('blur', markLeft);
  document.addEventListener('visibilitychange', onVisibility);
  window.setTimeout(() => {
    window.removeEventListener('blur', markLeft);
    document.removeEventListener('visibilitychange', onVisibility);
    if (!left && !document.hidden) {
      window.location.href = landingUrl;
    }
  }, APP_OPEN_TIMEOUT_MS);
  window.location.href = appLink;
}

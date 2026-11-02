import { isDesktopApp } from "@/shared/lib/server-target";

/**
 * PWA: регистрирует `public/sw.js` в прод-сборке браузера. В Electron (app://hooba) и в dev не нужен:
 * dev-сервер Vite и кэш service worker мешали бы друг другу.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || isDesktopApp() || !("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* без service worker сайт работает как обычно, просто без установки */
    });
  });
}

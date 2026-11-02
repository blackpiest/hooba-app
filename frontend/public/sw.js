/* Service worker Hooba (PWA). Офлайн-режима у приложения нет — без сети нет ни чата, ни голоса.
   Задача — установка на телефон и быстрый запуск:
   - страницы (навигация): сначала сеть, без сети — последний сохранённый index.html (приложение само покажет «нет связи»);
   - /assets/* (имена с хешем, не меняются): из кэша, иначе сеть;
   - API, WebSocket, загрузки и всё остальное — мимо кэша;
   - звук и видео — мимо service worker совсем: плеер грузит их кусками (Range), а ответ целым файлом из кэша
     ломает воспроизведение (на телефоне звук звучал дважды). */

const VERSION = "v2";
const SHELL_CACHE = `hooba-shell-${VERSION}`;
const ASSET_CACHE = `hooba-assets-${VERSION}`;
const ASSET_LIMIT = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request("/", { cache: "reload" })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("hooba-") && key !== SHELL_CACHE && key !== ASSET_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  // Старые сборки копятся под теми же ключами-хешами: удаляем самые ранние записи.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - ASSET_LIMIT)).map((key) => cache.delete(key)));
}

async function fromNetworkThenShell(request) {
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match("/", { cacheName: SHELL_CACHE });
    if (cached) return cached;
    throw error;
  }
}

async function fromCacheThenNetwork(request) {
  const cached = await caches.match(request, { cacheName: ASSET_CACHE });
  if (cached) return cached;
  const response = await fetch(request);
  // Только полный ответ: частичный (206) Cache API не принимает.
  if (response.status === 200) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
    void trimAssets();
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.has("range") || request.destination === "audio" || request.destination === "video") return;

  if (request.mode === "navigate") {
    // Служебные адреса (скачивание обновлений десктопа и т.п.) — как есть.
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/updates/")) return;
    event.respondWith(fromNetworkThenShell(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(fromCacheThenNetwork(request));
  }
});

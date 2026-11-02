import { useEffect } from "react";

/** Иконка вкладки из index.html — к ней возвращаемся, когда аватара нет. */
let defaultHref: string | null = null;

function iconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]');
}

function restoreDefault(link: HTMLLinkElement) {
  if (defaultHref) {
    link.type = "image/png";
    link.href = defaultHref;
  }
}

/**
 * Favicon вкладки = аватар сервера (`src` — готовая ссылка); null — стандартная иконка Hooba.
 * При размонтировании (выход из приложения) возвращается стандартная: без входа аватар не показываем.
 */
export function useServerFavicon(src: string | null): void {
  useEffect(() => {
    const link = iconLink();
    if (!link) {
      return;
    }
    defaultHref ??= link.getAttribute("href");
    if (!src) {
      restoreDefault(link);
      return;
    }
    link.type = "image/webp";
    link.href = src;
    return () => restoreDefault(link);
  }, [src]);
}

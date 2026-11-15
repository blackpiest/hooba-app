import { useEffect } from "react";
import { getServerProfiles, getServerUrl, isDesktopApp, saveServerProfile } from "@/shared/lib/server-target";

/** Сторона уменьшенной копии аватара: плитка панели — 48px, запас на HiDPI. */
const ICON_SIDE = 96;

function iconPathOf(relativeUrl: string | null): string | null {
  if (!relativeUrl) {
    return null;
  }
  return relativeUrl.split("?")[0] ?? null;
}

async function downscaleIcon(src: string): Promise<string | null> {
  const res = await fetch(src);
  if (!res.ok) {
    return null;
  }
  const bitmap = await createImageBitmap(await res.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIDE;
    canvas.height = ICON_SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, ICON_SIDE, ICON_SIDE);
    return canvas.toDataURL("image/webp", 0.9);
  } finally {
    bitmap.close();
  }
}

/**
 * Запоминает название и аватар текущего сервера для панели серверов (только desktop).
 * `iconUrl` — относительный путь из API (с подписью), `iconSrc` — готовая ссылка для загрузки.
 */
export function useRememberServerProfile(name: string | null, iconUrl: string | null, iconSrc: string | null): void {
  useEffect(() => {
    const origin = getServerUrl();
    if (!isDesktopApp() || !origin || name === null) {
      return;
    }
    const iconPath = iconPathOf(iconUrl);
    const saved = getServerProfiles().find((item) => item.origin === origin);
    if (saved && saved.name === name && saved.iconPath === iconPath && (iconPath === null || saved.icon !== null)) {
      return;
    }
    let cancelled = false;
    const keepIcon = saved && saved.iconPath === iconPath ? saved.icon : null;
    saveServerProfile({ origin, name, icon: keepIcon, iconPath });
    if (!iconSrc || keepIcon) {
      return;
    }
    void downscaleIcon(iconSrc)
      .then((icon) => {
        if (!cancelled && icon && getServerUrl() === origin) {
          saveServerProfile({ origin, name, icon, iconPath });
        }
      })
      .catch(() => {
        // не загрузилось — в панели будет буква, попробуем при следующем запуске
      });
    return () => {
      cancelled = true;
    };
  }, [name, iconUrl, iconSrc]);
}

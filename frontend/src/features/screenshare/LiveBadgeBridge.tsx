import { useEffect } from "react";
import { isDesktopApp } from "@/shared/lib/server-target";
import { useScreenShareStore } from "./screen-share-store";

/** Подпись «Вы в эфире» поверх экрана, только пока десктоп-клиент ведёт демонстрацию. */
export function LiveBadgeBridge() {
  const hosting = useScreenShareStore((s) => s.hosting);

  useEffect(() => {
    if (!isDesktopApp()) {
      return;
    }
    window.hoobaDesktop?.publishLiveBadge?.(hosting);
  }, [hosting]);

  useEffect(() => {
    if (!isDesktopApp()) {
      return;
    }
    return () => {
      window.hoobaDesktop?.publishLiveBadge?.(false);
    };
  }, []);

  return null;
}

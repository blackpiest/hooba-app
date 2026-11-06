import { useEffect, useLayoutEffect } from "react";
import wordmark from "@/assets/hooba-wordmark.svg";

if (typeof document !== "undefined" && window.location.pathname === "/live") {
  document.documentElement.classList.add("ds-overlay");
}

export function LiveBadgePage() {
  useLayoutEffect(() => {
    document.documentElement.classList.add("ds-overlay");
    return () => document.documentElement.classList.remove("ds-overlay");
  }, []);

  useEffect(() => {
    const blockNativeMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("contextmenu", blockNativeMenu);
    return () => document.removeEventListener("contextmenu", blockNativeMenu);
  }, []);

  return (
    <div
      className="pointer-events-none fixed top-0 right-0 inline-flex h-9 items-center justify-center gap-2 border border-line-strong bg-bg/85 pr-3 pl-2.5 font-label text-[11px] whitespace-nowrap text-fg uppercase select-none"
      role="status"
    >
      <span className="ds-live-pulse size-2 bg-danger shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-danger)_28%,transparent)]" aria-hidden />
      <span>Вы в эфире</span>
      <img src={wordmark} alt="" className="mb-px h-4 w-auto object-contain" />
    </div>
  );
}

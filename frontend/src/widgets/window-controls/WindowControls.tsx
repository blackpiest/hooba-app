import { useEffect, useLayoutEffect, useState } from 'react';
import { isDesktopApp } from '@/shared/lib/server-target';
import { WindowControls as WindowControlsView } from '@/shared/ui';

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const desktop = isDesktopApp();
  const version = window.hoobaDesktop?.version?.trim();
  const title = version ? `Hooba ${version}` : 'Hooba';

  useLayoutEffect(() => {
    if (!desktop) {
      return;
    }
    const root = document.documentElement;
    root.classList.add('ns-desktop');
    document.title = title;
    const platform = window.hoobaDesktop?.platform;
    if (platform) {
      root.dataset.platform = platform;
    }
  }, [desktop, title]);

  useEffect(() => {
    if (!desktop) {
      return;
    }
    return window.hoobaDesktop?.onMaximizedChange?.(setMaximized);
  }, [desktop]);

  if (!desktop) {
    return null;
  }

  return (
    <>
      <div className="pointer-events-none fixed top-0 left-1/2 z-[70] flex h-7 -translate-x-1/2 items-center gap-2 text-xs font-semibold tracking-[0.01em] text-fg select-none">
        <img src="/hooba-favicon.png" alt="" width={16} height={16} className="size-4 object-cover" />
        <span>{title}</span>
      </div>
      <WindowControlsView
        className="fixed top-0 right-0 z-[80] h-7 items-center [-webkit-app-region:no-drag] [html[data-platform=darwin]_&]:hidden"
        isMaximized={maximized}
        onMinimize={() => window.hoobaDesktop?.minimize?.()}
        onToggleMaximize={() => window.hoobaDesktop?.toggleMaximize?.()}
        onClose={() => window.hoobaDesktop?.close?.()}
      />
    </>
  );
}

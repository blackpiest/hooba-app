import { useEffect, useState } from 'react';
import { Button, Progress } from '@/shared/ui';
import { isDesktopApp, type DesktopUpdateState } from '@/shared/lib/server-target';

const idle: DesktopUpdateState = { phase: 'idle', version: '', percent: 0 };

export function DesktopUpdateNotice() {
  const desktop = isDesktopApp();
  const [state, setState] = useState<DesktopUpdateState>(idle);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!desktop) {
      return;
    }
    let cancelled = false;
    void window.hoobaDesktop?.updateState?.().then((next) => {
      if (!cancelled && next) {
        setState(next);
      }
    });
    const unsubscribe = window.hoobaDesktop?.onUpdateState?.(setState);
    const unsubscribeReveal = window.hoobaDesktop?.onUpdateReveal?.(() => setDismissed(false));
    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribeReveal?.();
    };
  }, [desktop]);

  if (!desktop || dismissed || state.phase === 'idle') {
    return null;
  }

  const busy = state.phase === 'downloading';
  const label =
    state.phase === 'ready'
      ? 'Перезапустить'
      : state.phase === 'error'
        ? 'Повторить'
        : 'Обновить';

  return (
    <div
      className="fixed top-14 left-1/2 z-[65] flex w-[min(440px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 border border-line-strong bg-elevated py-2.5 pr-3 pl-2.5 text-fg shadow-key [-webkit-app-region:no-drag]"
      role="status"
    >
      <img src="/hooba-logo.webp" alt="" width={28} height={28} className="size-7 object-cover" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Доступно обновление</p>
        <p className="text-xs text-muted">
          {state.phase === 'downloading'
            ? `Загрузка ${state.percent}%`
            : state.phase === 'ready'
              ? 'Готово к установке'
              : state.phase === 'error'
                ? 'Не удалось скачать'
                : `Версия ${state.version}`}
        </p>
        {busy ? <Progress value={state.percent} aria-label="Загрузка обновления" className="mt-1.5" /> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {state.phase === 'available' ? (
          <Button variant="ghost" size="sm" onPress={() => setDismissed(true)}>
            Позже
          </Button>
        ) : null}
        <Button
          size="sm"
          isDisabled={busy}
          onPress={() => {
            if (state.phase === 'ready') {
              void window.hoobaDesktop?.installUpdate?.();
              return;
            }
            void window.hoobaDesktop?.downloadUpdate?.();
          }}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}

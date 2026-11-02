import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { UserAvatar } from "@/shared/ui/user-avatar/UserAvatar";
import type { DesktopToast } from "@/shared/lib/desktop-toasts";
import { cx } from "@/utils/cx";

const TOAST_DURATION_MS = 6000;

if (typeof document !== "undefined" && window.location.pathname === "/toasts") {
  document.documentElement.classList.add("ds-overlay");
}

function ToastCard({ toast }: { toast: DesktopToast }) {
  const [paused, setPaused] = useState(false);
  const isGame = toast.kind === "game";

  useEffect(() => {
    if (paused) {
      return;
    }
    const timer = window.setTimeout(() => window.hoobaDesktop?.dismissToast?.(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, paused]);

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={toast.passive ? undefined : () => window.hoobaDesktop?.clickToast?.(toast.id)}
      className={cx(
        "ds-toast-in relative flex w-full items-start gap-3 overflow-hidden border border-l-[3px] border-line-strong bg-elevated py-3 pl-3.5 shadow-[5px_5px_0_#000a]",
        toast.passive ? "pr-3.5" : "cursor-pointer pr-2 transition-colors hover:bg-surface",
        isGame ? "border-l-success" : "border-l-brand-text",
      )}
    >
      <UserAvatar look={toast.avatar} name={toast.title} size="md" />
      <div className="min-w-0 flex-1 text-fg">
        <p className="flex items-baseline gap-1.5 text-[13px] leading-snug">
          <span className="truncate font-semibold">{toast.title}</span>
          {toast.meta ? <span className="shrink-0 truncate text-xs text-muted">{toast.meta}</span> : null}
        </p>
        {isGame ? (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold leading-snug text-success">
            <Icon name="gamepad" size="xs" />
            <span className="truncate">{toast.body}</span>
          </p>
        ) : toast.body ? (
          <p className="mt-0.5 line-clamp-2 break-words text-xs leading-relaxed text-muted">{toast.body}</p>
        ) : null}
      </div>
      {toast.passive ? null : (
        <span onClick={(event) => event.stopPropagation()}>
          <IconButton
            icon="close"
            label="Закрыть уведомление"
            size="sm"
            onPress={() => window.hoobaDesktop?.dismissToast?.(toast.id)}
          />
        </span>
      )}
      {!paused ? (
        <i
          aria-hidden="true"
          className={cx("absolute bottom-0 left-0 h-0.5 w-full origin-left", isGame ? "bg-success" : "bg-brand-text")}
          style={{ animation: `ds-toast-bar ${TOAST_DURATION_MS}ms linear forwards` }}
        />
      ) : null}
    </div>
  );
}

/** Окно `/toasts` десктопа: стопка уведомлений в правом нижнем углу, пока главное окно не в фокусе. */
export function ToastsPage() {
  const [toasts, setToasts] = useState<DesktopToast[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);
  const hasToasts = toasts.length > 0;

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

  useEffect(() => {
    const api = window.hoobaDesktop;
    if (!api?.onToasts) {
      return;
    }
    let cancelled = false;
    void api.getToasts?.().then((current) => {
      if (!cancelled) {
        setToasts(current);
      }
    });
    const unsubscribe = api.onToasts((next) => {
      if (!cancelled) {
        setToasts(next);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack) {
      return;
    }
    const report = () => {
      window.hoobaDesktop?.resizeToasts?.(stack.offsetHeight);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(stack);
    return () => observer.disconnect();
  }, [hasToasts]);

  if (!hasToasts) {
    return null;
  }

  return (
    <div ref={stackRef} className="box-border flex w-[360px] flex-col gap-2 pb-2 pl-1 pr-2 pt-1">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

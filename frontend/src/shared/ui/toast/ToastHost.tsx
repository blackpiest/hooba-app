import { useEffect, useState } from "react";
import { cx } from "@/utils/cx";
import { Button, IconButton } from "@/shared/ui/button";
import { Icon, type IconName } from "@/shared/ui/icon";
import { useToastStore, type ToastItem, type ToastTone } from "./toast-store";

const TONE: Record<ToastTone, { box: string; icon: IconName; bar: string }> = {
  info: { box: "border-l-brand-text text-brand-text", icon: "info", bar: "bg-brand-text" },
  success: { box: "border-l-success text-success", icon: "check", bar: "bg-success" },
  warning: { box: "border-l-warning text-warning", icon: "warning", bar: "bg-warning" },
  danger: { box: "border-l-danger text-danger", icon: "alert", bar: "bg-danger" },
};

function ToastView({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const [paused, setPaused] = useState(false);
  const tone = TONE[item.tone];
  const action = item.action;

  function runAction() {
    if (!action) {
      return;
    }
    dismiss(item.id);
    action.onPress();
  }

  useEffect(() => {
    if (item.duration <= 0 || paused) {
      return;
    }
    const timer = window.setTimeout(() => dismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, paused, dismiss]);

  return (
    <div
      role={item.tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // Клик мышью по карточке — то же действие; с клавиатуры — кнопка внутри. Кнопки обрабатывают нажатие сами.
      onClick={action ? (event) => !(event.target as Element).closest("button") && runAction() : undefined}
      className={cx(
        "ds-toast-in relative flex w-[360px] max-w-[calc(100vw-2.5rem)] max-md:w-full max-md:max-w-none items-start gap-3 overflow-hidden border border-l-[3px] border-line-strong bg-elevated py-3.5 pl-4 pr-2 shadow-[5px_5px_0_#000a]",
        tone.box,
        action && "cursor-pointer",
      )}
    >
      <Icon name={tone.icon} className="mt-px" />
      <div className="min-w-0 flex-1 text-fg">
        <p className="text-[13px] font-semibold leading-snug">{item.title}</p>
        {item.description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p> : null}
        {action ? (
          <Button variant="link" className="mt-2" onPress={runAction}>
            {action.label}
          </Button>
        ) : null}
      </div>
      <IconButton icon="close" label="Закрыть уведомление" size="sm" onPress={() => dismiss(item.id)} />
      {item.duration > 0 && !paused ? (
        <i
          aria-hidden="true"
          className={cx("absolute bottom-0 left-0 h-0.5 w-full origin-left", tone.bar)}
          style={{ animation: `ds-toast-bar ${item.duration}ms linear forwards` }}
        />
      ) : null}
    </div>
  );
}

/** Контейнер уведомлений. Монтируется один раз на приложение (правый нижний угол). */
export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  return (
    <div
      role="region"
      aria-label="Уведомления"
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-[110] flex flex-col gap-2.5 max-md:inset-x-2 max-md:bottom-auto max-md:top-[max(0.5rem,env(safe-area-inset-top))]"
    >
      {toasts.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastView item={item} />
        </div>
      ))}
    </div>
  );
}

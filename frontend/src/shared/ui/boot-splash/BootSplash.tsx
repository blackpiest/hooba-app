import { Button, EmptyState, MarkLoader, Slime } from "@/shared/ui";

type BootSplashProps = {
  /** Текст вместо загрузчика: сервер не ответил, сессия на месте. */
  message?: string;
  onRetry?: () => void;
};

/** Экран загрузки поверх приложения: логотип подпрыгивает; при ошибке — слайм «нет сети», сообщение и «Повторить». */
export function BootSplash({ message, onRetry }: BootSplashProps) {
  const failed = Boolean(message);
  return (
    <div
      className="ds-fill-screen fixed inset-0 z-[60] flex items-center justify-center bg-bg/85 pt-[var(--ds-titlebar-h,0px)] backdrop-blur-[10px]"
      aria-live="polite"
    >
      {failed ? (
        <EmptyState
          className="max-w-sm"
          illustration={<Slime pose="offline" />}
          title="Нет связи"
          description={message}
          action={onRetry ? <Button onPress={onRetry}>Повторить</Button> : undefined}
        />
      ) : (
        <MarkLoader size="lg" />
      )}
    </div>
  );
}

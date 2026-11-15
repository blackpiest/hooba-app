import type { ReactNode } from "react";
import { Button, EmptyState, MarkLoader, Slime } from "@/shared/ui";

type BootSplashProps = {
  /** Текст вместо загрузчика: сервер не ответил, сессия на месте. */
  message?: string;
  onRetry?: () => void;
  /** Колонка слева (панель серверов desktop): с неё можно уйти на другой сервер, не дожидаясь этого. */
  aside?: ReactNode;
};

/** Экран загрузки поверх приложения: логотип подпрыгивает; при ошибке — слайм «нет сети», сообщение и «Повторить». */
export function BootSplash({ message, onRetry, aside }: BootSplashProps) {
  const failed = Boolean(message);
  return (
    <div
      className="ds-fill-screen fixed inset-0 z-[60] flex bg-bg/85 pt-[var(--ds-titlebar-h,0px)] backdrop-blur-[10px]"
      aria-live="polite"
    >
      {aside}
      <div className="flex min-w-0 flex-1 items-center justify-center">
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
    </div>
  );
}

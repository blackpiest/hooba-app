import { useEffect } from "react";
import { formatApiError } from "@/shared/api/format-error";
import { Alert } from "@/shared/ui";

const AUTO_HIDE_MS = 6000;

/** Ошибка отправки/вложений над полем ввода: закрывается сама через 6 с или крестиком. */
export function ComposerNotice({ code, onClose }: { code: string; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [code, onClose]);

  return (
    <div className="shrink-0 px-4 pb-2">
      <Alert tone="danger" compact onClose={onClose}>
        {formatApiError(code)}
      </Alert>
    </div>
  );
}

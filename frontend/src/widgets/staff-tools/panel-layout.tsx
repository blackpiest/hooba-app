import type { ReactNode } from "react";
import { IconButton } from "@/shared/ui";

/** Вступление раздела: короткое пояснение слева, главное действие («Новое …») справа. */
export function PanelIntro({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="min-w-0 max-w-[62ch] flex-[1_1_280px] text-xs leading-relaxed text-muted">{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Шапка редактора внутри раздела: «назад к списку», название и статус. */
export function EditorHeader({
  title,
  backLabel,
  onBack,
  status,
}: {
  title: ReactNode;
  backLabel: string;
  onBack: () => void;
  status?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line pb-4">
      <IconButton icon="arrow-left" label={backLabel} onPress={onBack} />
      <h3 className="min-w-0 flex-1 truncate font-heading text-base tracking-tight">{title}</h3>
      {status}
    </div>
  );
}

/** Нижняя панель редактора: разрушающее действие слева, сохранение справа. */
export function EditorFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">{children}</div>;
}

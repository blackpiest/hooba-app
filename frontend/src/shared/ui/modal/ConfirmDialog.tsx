import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Modal } from "./Modal";

export type ConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** Пояснение последствий: что произойдёт и можно ли вернуть. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` — необратимое действие: кнопка подтверждения красная. */
  tone?: "default" | "danger";
  /** Идёт выполнение: кнопки блокируются, окно нельзя закрыть. */
  isPending?: boolean;
};

/**
 * Подтверждение действия. Фокус по умолчанию — на «Отмена», чтобы случайный Enter не подтвердил опасное.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  tone = "default",
  isPending = false,
}: ConfirmDialogProps) {
  const danger = tone === "danger";
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      role="alertdialog"
      tone={tone}
      icon={danger ? "warning" : undefined}
      isDismissable={!isPending}
      hideClose
      footer={
        <>
          <Button variant="ghost" autoFocus onPress={onClose} isDisabled={isPending}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onPress={onConfirm} isPending={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description}
    </Modal>
  );
}

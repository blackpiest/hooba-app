import type { HTMLAttributes, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Обёртка сортируемого канала (dnd-kit). Ручкой перетаскивания служит сама строка канала. */
export function SortableChannelBlock({
  id,
  disabled,
  children,
}: {
  id: number;
  disabled: boolean;
  children: (handle: {
    ref: (element: HTMLElement | null) => void;
    listeners?: HTMLAttributes<HTMLElement>;
    attributes?: HTMLAttributes<HTMLElement>;
  }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null),
        transition: isDragging ? undefined : transition,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      {children({
        ref: setActivatorNodeRef,
        listeners: disabled ? undefined : (listeners as HTMLAttributes<HTMLElement> | undefined),
        attributes: disabled ? undefined : (attributes as HTMLAttributes<HTMLElement>),
      })}
    </div>
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/shared/ui";

/** Всплывающая карточка «Сейчас стримит» рядом с участником: позиция по якорю, остаётся в окне. */
export function ScreenShareJoinCard({
  username,
  top,
  left,
  onJoin,
  onPointerEnter,
  onPointerLeave,
}: {
  username: string;
  top: number;
  left: number;
  onJoin: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top, left });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    const nextLeft = Math.min(Math.max(8, left), window.innerWidth - rect.width - 8);
    const nextTop =
      top + rect.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - rect.height - 8) : top;
    setPos({ top: nextTop, left: nextLeft });
  }, [top, left]);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Демонстрация экрана"
      className="fixed z-50 w-56 border border-line-strong bg-elevated p-3 text-fg shadow-pop"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      <p className="text-sm font-medium">Сейчас стримит</p>
      <p className="mt-1 truncate text-xs text-muted">{username}</p>
      <Button size="sm" fullWidth className="mt-3" onPress={onJoin}>
        Присоединиться
      </Button>
    </div>,
    document.body,
  );
}

import { useEffect, useRef } from "react";

/**
 * react-aria закрывает всплывашки только по левой кнопке мыши. Кладётся внутрь любой панели
 * (Popover, Menu, Select): правый клик вне панели закрывает её так же, как левый.
 * Закрытие — через Esc на самой панели, чтобы отработали штатные `onOpenChange` и возврат фокуса.
 */
export function CloseOnOutsideContextMenu() {
  const sentinel = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const panel = sentinel.current?.closest<HTMLElement>(".ds-drop, [data-trigger]");
    if (!panel) {
      return;
    }
    const onContextMenu = (event: MouseEvent) => {
      if (event.target instanceof Node && panel.contains(event.target)) {
        return;
      }
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    };
    document.addEventListener("contextmenu", onContextMenu, true);
    return () => document.removeEventListener("contextmenu", onContextMenu, true);
  }, []);

  return <span ref={sentinel} hidden />;
}

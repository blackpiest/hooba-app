import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { DOMAttributes, FocusableElement } from "@react-types/shared";
import { Focusable, Tooltip as AriaTooltip, TooltipTrigger, type TooltipProps as AriaTooltipProps } from "react-aria-components";
import { useIsTouch } from "@/hooks/use-breakpoint";

export type TooltipProps = {
  /** Текст подсказки. Пустой — подсказки нет, дети рендерятся как есть (удобно для условных подсказок). */
  content?: ReactNode;
  placement?: AriaTooltipProps["placement"];
  /** Задержка показа, мс. */
  delay?: number;
  /** Фокусируемый элемент: Button, IconButton, Checkbox и другие компоненты кита. */
  children: ReactElement;
  /**
   * Для обычных элементов (текст, `<span>`, отключённая кнопка): оборачивает в `Focusable`, чтобы подсказка
   * работала и у не-интерактивного элемента. Нужен для усечённого текста и подсказок «почему недоступно».
   */
  plain?: boolean;
  /**
   * Поведение на сенсорном экране (наведения там нет). `tap` — подсказка открывается нажатием и закрывается
   * нажатием на неё же или в любом другом месте; `off` — не показывается (подпись иконки дублирует aria-label,
   * а нажатие должно только выполнять действие). По умолчанию `tap` у `plain`, `off` у остальных.
   */
  touch?: "tap" | "off";
};

const TOOLTIP_CLASS =
  "z-[90] max-w-xs bg-paper px-2.5 py-2 font-label text-[10px] uppercase leading-none tracking-[0.06em] text-on-paper shadow-[3px_3px_0_var(--color-accent)]";

/**
 * Подсказка при hover / фокусе. Оборачивает один компонент кита:
 * `<Tooltip content="Выключить микрофон"><IconButton … /></Tooltip>`.
 * Поведение (задержка, закрытие по Esc, aria-describedby) — react-aria. На сенсорном экране — см. `touch`.
 */
export function Tooltip({ content, placement = "top", delay = 300, plain, touch, children }: TooltipProps) {
  const isTouch = useIsTouch();
  if (content == null || content === false || content === "") {
    return children;
  }
  if (isTouch) {
    if ((touch ?? (plain ? "tap" : "off")) === "off") {
      return children;
    }
    return (
      <TapTooltip content={content} placement={placement} plain={plain}>
        {children}
      </TapTooltip>
    );
  }
  return (
    <TooltipTrigger delay={delay} closeDelay={0}>
      {plain ? <Focusable>{children as unknown as ReactElement<DOMAttributes<FocusableElement>, string>}</Focusable> : children}
      <AriaTooltip placement={placement} offset={10} className={TOOLTIP_CLASS}>
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}

/** Подсказка по нажатию: открывается тапом по элементу, закрывается тапом по ней же, по элементу или снаружи. */
function TapTooltip({
  content,
  placement,
  plain,
  children,
}: Required<Pick<TooltipProps, "content" | "placement">> & Pick<TooltipProps, "plain" | "children">) {
  const [isOpen, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: PointerEvent) => {
      // Нажатие по самому элементу переключает подсказку в onClick — здесь его не трогаем.
      if (wrapper.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const hide = () => setOpen(false);
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, [isOpen]);

  return (
    <TooltipTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) setOpen(false);
      }}
      delay={0}
      closeDelay={0}
    >
      {/* display: contents — обёртка не влияет на раскладку, только ловит нажатие. */}
      <span ref={wrapper} className="contents" onClick={() => setOpen((open) => !open)}>
        {plain ? <Focusable>{children as unknown as ReactElement<DOMAttributes<FocusableElement>, string>}</Focusable> : children}
      </span>
      <AriaTooltip placement={placement} offset={10} className={TOOLTIP_CLASS}>
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button as AriaButton, Tooltip as AriaTooltip, TooltipTrigger } from "react-aria-components";
import { cx } from "@/utils/cx";
import { useIsTouch } from "@/hooks/use-breakpoint";
import { useLongPress } from "@/shared/lib/use-long-press";
import { POPOVER_SURFACE } from "@/shared/ui/popover";

export type ReactionChipProps = {
  /** Эмодзи-символ или картинка смайлика (`<img>` 16px). */
  emoji: ReactNode;
  count: number;
  /** Смотрящий уже поставил эту реакцию. */
  active?: boolean;
  /** Карточка при наведении (`ReactionDetails`): кто поставил. */
  details?: ReactNode;
  /** Нет — только просмотр (права нет). */
  onPress?: () => void;
  "aria-label": string;
};

/**
 * Реакция под сообщением: эмодзи и счётчик; нажатие ставит или снимает свою, наведение показывает, кто поставил.
 * На сенсорном экране «кто поставил» — по долгому нажатию (у реакции без права — и по обычному).
 */
export function ReactionChip({ emoji, count, active, details, onPress, ...aria }: ReactionChipProps) {
  const isTouch = useIsTouch();
  const [touchOpen, setTouchOpen] = useState(false);
  const longPressed = useRef(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const longPress = useLongPress(
    () => {
      longPressed.current = true;
      setTouchOpen(true);
    },
    { enabled: isTouch && Boolean(details) },
  );

  useEffect(() => {
    if (!touchOpen) return;
    const close = (event: PointerEvent) => {
      if (wrapper.current?.contains(event.target as Node)) return;
      setTouchOpen(false);
    };
    const hide = () => setTouchOpen(false);
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, [touchOpen]);

  const press = () => {
    // Отпускание пальца после долгого нажатия — не нажатие: реакцию не переключаем.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (isTouch && touchOpen) {
      setTouchOpen(false);
      return;
    }
    onPress?.();
  };

  const chip = (
    <AriaButton
      {...aria}
      aria-pressed={active}
      isDisabled={!onPress && !(isTouch && details)}
      onPress={onPress || (isTouch && details) ? (onPress ? press : () => setTouchOpen((open) => !open)) : undefined}
      className={cx(
        "ds-focus inline-flex h-6 items-center gap-1 border px-1.5 text-xs leading-none outline-none touch:h-8 touch:px-2",
        active ? "border-brand/60 bg-brand-soft text-brand-fg" : "border-line bg-elevated text-muted",
        onPress ? "cursor-pointer data-[hovered]:border-line-strong" : "cursor-default",
      )}
    >
      <span className="flex size-4 items-center justify-center text-[15px]">{emoji}</span>
      <span className="font-label tabular-nums">{count}</span>
    </AriaButton>
  );
  if (!details) {
    return chip;
  }
  if (isTouch) {
    return (
      <TooltipTrigger isOpen={touchOpen} onOpenChange={(open) => !open && setTouchOpen(false)} delay={0} closeDelay={0}>
        <span ref={wrapper} className="contents" {...longPress}>
          {chip}
        </span>
        <AriaTooltip placement="top" offset={8} className={cx(POPOVER_SURFACE, "w-max min-w-40 max-w-60 p-3")}>
          {details}
        </AriaTooltip>
      </TooltipTrigger>
    );
  }
  // Карточка открывается наведением и фокусом (как подсказка), но выглядит как поповер; внутри ничего не нажимается.
  return (
    <TooltipTrigger delay={300} closeDelay={100}>
      {chip}
      <AriaTooltip placement="top" offset={8} className={cx(POPOVER_SURFACE, "w-max min-w-40 max-w-60 p-3")}>
        {details}
      </AriaTooltip>
    </TooltipTrigger>
  );
}

function reactedMoreLabel(more: number): string {
  const one = more % 10 === 1 && more % 100 !== 11;
  return `и ещё ${more} ${one ? "отреагировал" : "отреагировало"}`;
}

/** Содержимое карточки реакции: крупная картинка, имя, список людей и «и ещё N отреагировало». */
export function ReactionDetails({
  emoji,
  title,
  people,
  more,
}: {
  /** Эмодзи-символ или `<img>` — рисуется крупно (40px). */
  emoji: ReactNode;
  /** Имя реакции (`:party:`). */
  title?: string;
  /** Строки людей (аватар + имя), уже обрезанные до показываемого числа. */
  people: ReactNode[];
  /** Сколько ещё поставили, но не показаны. */
  more: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="flex size-10 items-center justify-center text-[34px] leading-none">{emoji}</span>
      {title ? <p className="font-label text-[10px] tracking-[0.06em] text-muted">{title}</p> : null}
      <ul className="flex w-full flex-col gap-1.5">{people}</ul>
      {more > 0 ? <p className="w-full text-xs text-muted">{reactedMoreLabel(more)}</p> : null}
    </div>
  );
}

/** Строка человека в `ReactionDetails`. */
export function ReactionPerson({ avatar, name }: { avatar: ReactNode; name: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm text-fg">
      {avatar}
      <span className="truncate">{name}</span>
    </li>
  );
}

/** Ряд реакций под сообщением; последним элементом можно передать кнопку «добавить». */
export function ReactionBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mt-1 flex flex-wrap items-center gap-1", className)}>{children}</div>;
}

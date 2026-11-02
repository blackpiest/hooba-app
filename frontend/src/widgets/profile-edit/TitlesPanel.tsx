import { useMemo, useRef } from "react";
import { playLockedSelectSound } from "@/features/ui-sounds/ui-sounds";
import type { OwnedTitle } from "@/shared/api/badges";
import { Badge, BadgeIcon, Icon, Radio, RadioGroup, type BadgeSpec, type TitleSpec } from "@/shared/ui";
import { restartAnimation } from "@/utils/restart-animation";

/** Значение «без титула» в группе. id каталога не может начинаться с «_». */
const NO_TITLE = "_none";

/**
 * Вкладка «Титул»: «Без титула» и титулы витрины (запас вызывающий уже отфильтровал); неполученные видны,
 * но выбрать их нельзя: нажатие трясёт вариант и звучит «недоступно». `reserved` — титулы «в запасе» для пометки (передаётся только владельцу).
 * `fresh` — полученные, которые ещё не выбирали (метка «Новое»).
 */
export function TitlesPanel({
  titles,
  badges,
  owned,
  value,
  onChange,
  reserved,
  fresh,
  isDisabled,
}: {
  titles: TitleSpec[];
  reserved?: ReadonlySet<string>;
  fresh?: ReadonlySet<string>;
  badges: BadgeSpec[];
  owned: OwnedTitle[];
  value: string | null;
  onChange: (next: string | null) => void;
  isDisabled?: boolean;
}) {
  const ownedIds = useMemo(() => new Set(owned.map((item) => item.id)), [owned]);
  // Полученные — первыми.
  const sorted = useMemo(
    () => [...titles].sort((a, b) => Number(ownedIds.has(b.id)) - Number(ownedIds.has(a.id))),
    [titles, ownedIds],
  );
  const refs = useRef(new Map<string, HTMLLabelElement>());

  function pick(next: string) {
    if (next !== NO_TITLE && !ownedIds.has(next)) {
      // Группа контролируемая: не передаём выбор наверх — остаётся прежний титул.
      playLockedSelectSound();
      restartAnimation(refs.current.get(next));
      return;
    }
    onChange(next === NO_TITLE ? null : next);
  }

  return (
    <RadioGroup
      aria-label="Титул"
      hint="Показывается под именем на карточке профиля. Титулы выдаёт владелец сервера."
      value={value ?? NO_TITLE}
      onChange={pick}
      isDisabled={isDisabled}
    >
      <Radio value={NO_TITLE} variant="card">
        Без титула
      </Radio>
      {sorted.map((title) => {
        const badge = title.badge ? badges.find((item) => item.id === title.badge) : undefined;
        const has = ownedIds.has(title.id);
        return (
          <Radio
            key={title.id}
            ref={(node) => {
              if (node) {
                refs.current.set(title.id, node);
              } else {
                refs.current.delete(title.id);
              }
            }}
            value={title.id}
            variant="card"
            isLocked={!has}
          >
            <span className="flex items-center gap-2">
              {badge ? <BadgeIcon icon={badge.icon} size={16} className={has ? undefined : "opacity-40 grayscale"} /> : null}
              {title.label}
              {has ? null : <span className="sr-only"> (не получен)</span>}
              {fresh?.has(title.id) ? <Badge variant="live">Новое</Badge> : null}
              {reserved?.has(title.id) ? (
                <span className="flex items-center gap-1 text-[11px] text-muted">
                  <Icon name="eye-off" size="xs" />в запасе
                </span>
              ) : null}
            </span>
          </Radio>
        );
      })}
    </RadioGroup>
  );
}

import { useMemo, useRef, useState } from "react";
import { playCosmeticSelectSound, playLockedSelectSound } from "@/features/ui-sounds/ui-sounds";
import { PINNED_BADGES_MAX, type OwnedBadge } from "@/shared/api/badges";
import {
  BadgeCard,
  BadgeIcon,
  Button,
  IconButton,
  SegmentedControl,
  TileGrid,
  type BadgeCategory,
  type BadgeSpec,
} from "@/shared/ui";
import { LABEL } from "@/shared/ui/text-field/field-styles";
import { cx } from "@/utils/cx";
import { restartAnimation } from "@/utils/restart-animation";
import { LockedTileOverlay, NewTileMark, PinnedTileMark, ReservedTileMark } from "./cosmetic-tiles";

type Filter = "all" | BadgeCategory;

const CATEGORY_ORDER: BadgeCategory[] = ["role", "achievement", "event", "reward"];
const CATEGORY_PLURAL: Record<BadgeCategory, string> = {
  role: "Роли",
  achievement: "Достижения",
  event: "События",
  reward: "Награды",
};

function formatGrantDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU");
}

/** Строка-примечание под описанием: откуда значок или как его получить. */
function badgeNote(badge: BadgeSpec, owned: OwnedBadge | undefined): { note: string; icon: "check" | "lock" } {
  if (!owned) {
    return { note: badge.hint ?? "Пока не получен", icon: "lock" };
  }
  if (owned.source === "role") {
    return { note: "Выдан автоматически вместе с ролью", icon: "check" };
  }
  return { note: `Получено ${formatGrantDate(owned.granted_at)}`, icon: "check" };
}

/**
 * Вкладка «Значки»: витрина каталога (неполученные — с замком; запас вызывающий уже отфильтровал),
 * фильтр по категориям, панель деталей и закрепление до трёх значков на карточке.
 * `reserved` — значки «в запасе» для пометки (передаётся только владельцу).
 * `fresh` — полученные, на которые ещё не нажимали (метка «Новое»); нажатие сообщает `onSeen`.
 */
export function BadgesPanel({
  badges,
  owned,
  pinned,
  onPinnedChange,
  reserved,
  fresh,
  onSeen,
  isDisabled,
}: {
  badges: BadgeSpec[];
  reserved?: ReadonlySet<string>;
  fresh?: ReadonlySet<string>;
  onSeen?: (id: string) => void;
  owned: OwnedBadge[];
  pinned: string[];
  onPinnedChange: (next: string[]) => void;
  isDisabled?: boolean;
}) {
  const ownedById = useMemo(() => new Map(owned.map((item) => [item.id, item])), [owned]);
  // Полученные — первыми, внутри — порядок каталога.
  const sorted = useMemo(
    () => [...badges].sort((a, b) => Number(ownedById.has(b.id)) - Number(ownedById.has(a.id))),
    [badges, ownedById],
  );
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? sorted : sorted.filter((badge) => badge.category === filter);
  const pinnedSlotsRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => pinned[0] ?? owned[0]?.id ?? sorted[0]?.id ?? null);
  const selected = badges.find((badge) => badge.id === selectedId) ?? visible[0] ?? null;

  const filterOptions = useMemo(
    () => [
      { value: "all", label: `Все · ${badges.length}` },
      ...CATEGORY_ORDER.flatMap((category) => {
        const count = badges.filter((badge) => badge.category === category).length;
        return count > 0 ? [{ value: category, label: `${CATEGORY_PLURAL[category]} · ${count}` }] : [];
      }),
    ],
    [badges],
  );

  if (badges.length === 0) {
    return <p className="text-sm text-muted">Значков пока нет.</p>;
  }

  const selectedOwned = selected ? ownedById.get(selected.id) : undefined;
  const note = selected ? badgeNote(selected, selectedOwned) : null;
  const selectedPinned = selected ? pinned.includes(selected.id) : false;
  const pinnedFull = pinned.length >= PINNED_BADGES_MAX;
  const pinnedBadges = pinned.flatMap((id) => badges.filter((badge) => badge.id === id));

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={LABEL}>
          Получено {owned.length}/{badges.length}
        </span>
        <div ref={pinnedSlotsRef} className="flex items-center gap-2">
          <span className={LABEL}>
            На профиле {pinned.length}/{PINNED_BADGES_MAX}
          </span>
          {Array.from({ length: PINNED_BADGES_MAX }, (_, i) => {
            const badge = pinnedBadges[i];
            return (
              <span
                key={i}
                className={cx(
                  "group relative grid size-8 place-items-center border bg-bg",
                  badge ? "border-brand/60" : "border-dashed border-line-strong",
                )}
              >
                {badge ? <BadgeIcon icon={badge.icon} size={22} /> : null}
                {badge ? (
                  <span className="absolute inset-0 opacity-0 transition-opacity group-has-[:focus-visible]:opacity-100 group-hover:opacity-100 touch:inset-auto touch:-right-2 touch:-top-2 touch:size-5 touch:opacity-100">
                    <IconButton
                      icon="close"
                      label={`Снять значок «${badge.name}»`}
                      size="sm"
                      isDisabled={isDisabled}
                      className="!size-full !bg-bg !text-fg data-[hovered]:!bg-bg data-[hovered]:!text-fg"
                      onPress={() => onPinnedChange(pinned.filter((id) => id !== badge.id))}
                    />
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>

      <SegmentedControl
        aria-label="Категория значков"
        className="max-w-full self-start overflow-x-auto"
        value={filter}
        onChange={(value) => setFilter(value as Filter)}
        options={filterOptions}
      />

      {/* Занимает остаток высоты вкладки: сетка и описание прокручиваются внутри, раскладка не прыгает. */}
      <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-[minmax(0,1fr)_250px] sm:grid-rows-[minmax(0,1fr)]">
        <div className="max-h-48 min-h-0 overflow-y-auto p-1.5 sm:max-h-none">
          <TileGrid
            label="Значки"
            className="grid-cols-[repeat(auto-fill,52px)] gap-2 sm:grid-cols-[repeat(auto-fill,52px)]"
            columns={{ base: 5, wide: 5 }}
            items={visible}
            selectedId={selected?.id ?? null}
            isDisabled={isDisabled}
            isItemLocked={(badge) => !ownedById.has(badge.id)}
            onSelect={(id) => {
              // Неполученный значок (с замком) звучит как закрытая косметика.
              playCosmeticSelectSound(!ownedById.has(id));
              setSelectedId(id);
              onSeen?.(id);
            }}
            getLabel={(badge) =>
              !ownedById.has(badge.id) ? `${badge.name} (не получен)` : fresh?.has(badge.id) ? `${badge.name} (новое)` : badge.name
            }
            getTooltip={(badge) => badge.name}
            renderTile={(badge) => {
              const has = ownedById.has(badge.id);
              return (
                <>
                  <span className={cx("absolute inset-0 grid place-items-center", !has && "opacity-35 grayscale")}>
                    <BadgeIcon icon={badge.icon} size={32} />
                  </span>
                  {has ? null : <LockedTileOverlay className="bg-transparent" />}
                  {pinned.includes(badge.id) ? <PinnedTileMark /> : null}
                  {reserved?.has(badge.id) ? <ReservedTileMark /> : null}
                  {fresh?.has(badge.id) ? <NewTileMark /> : null}
                </>
              );
            }}
          />
        </div>

        {selected ? (
          <div className="flex h-60 min-h-0 flex-col gap-3 border border-line bg-surface p-3 sm:h-auto">
            <BadgeCard
              badge={selected}
              locked={!selectedOwned}
              note={note?.note}
              noteIcon={note?.icon}
              className="min-h-0 flex-1 overflow-y-auto"
            />
            {/* Кнопка есть всегда (у неполученного — неактивна), чтобы панель не меняла раскладку. */}
            <div className="flex shrink-0 flex-col gap-2">
              {selectedPinned ? (
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={isDisabled}
                  onPress={() => onPinnedChange(pinned.filter((id) => id !== selected.id))}
                >
                  Убрать с профиля
                </Button>
              ) : (
                <Button
                  size="sm"
                  isDisabled={isDisabled || !selectedOwned}
                  onPress={() => {
                    // Мест нет: как с закрытой косметикой — тряска слотов «На профиле» и звук «недоступно».
                    if (pinnedFull) {
                      playLockedSelectSound();
                      restartAnimation(pinnedSlotsRef.current);
                      return;
                    }
                    onPinnedChange([...pinned, selected.id]);
                  }}
                >
                  Закрепить на профиле
                </Button>
              )}
              {selectedOwned && !selectedPinned && pinnedFull ? (
                <span className="text-[11px] text-muted">
                  Закреплено {PINNED_BADGES_MAX} из {PINNED_BADGES_MAX} — сначала уберите один.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

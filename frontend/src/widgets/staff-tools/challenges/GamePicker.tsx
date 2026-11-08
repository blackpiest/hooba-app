import { useEffect, useMemo, useState } from "react";
import { uniqueGameTitles } from "@/features/challenges/game-titles";
import { fetchGameCatalog } from "@/shared/api/game-activity";
import { ComboBox, Tag } from "@/shared/ui";

/** Как `games.max(20)` в `challenge-schema.ts` на сервере. */
const MAX_GAMES = 20;

/** Игры условия из каталога сервера; ничего не выбрано — считаются все. */
export function GamePicker({
  value,
  onChange,
  isDisabled,
}: {
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  isDisabled?: boolean;
}) {
  const [titles, setTitles] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stopped = false;
    fetchGameCatalog()
      .then((games) => {
        if (!stopped) {
          setTitles(uniqueGameTitles(games));
        }
      })
      .catch(() => {
        if (!stopped) {
          setFailed(true);
        }
      });
    return () => {
      stopped = true;
    };
  }, []);

  const picked = useMemo(() => value ?? [], [value]);
  const known = useMemo(() => new Set(titles ?? []), [titles]);
  const options = useMemo(
    () => (titles ?? []).filter((title) => !picked.includes(title)).map((title) => ({ value: title, label: title })),
    [titles, picked],
  );
  const full = picked.length >= MAX_GAMES;
  const unknown = titles ? picked.filter((game) => !known.has(game)) : [];

  const hint = full ? `Не больше ${MAX_GAMES} игр` : "Ничего не выбрано — считаются все игры.";

  return (
    <div className="flex flex-col gap-2">
      <ComboBox
        label="Игры"
        placeholder={titles || failed ? "Начните вводить название" : "Загружаем список…"}
        hint={hint}
        error={failed ? "Не удалось загрузить список игр. Откройте редактор ещё раз позже." : undefined}
        options={options}
        isDisabled={isDisabled || !titles || full}
        onSelect={(game) => onChange([...picked, game])}
      />
      {picked.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((game) => (
            <Tag
              key={game}
              className={titles && !known.has(game) ? "border-warning text-warning" : undefined}
              removeLabel={`Убрать ${game}`}
              onRemove={
                isDisabled
                  ? undefined
                  : () => {
                      const next = picked.filter((item) => item !== game);
                      onChange(next.length > 0 ? next : undefined);
                    }
              }
            >
              {game}
            </Tag>
          ))}
        </div>
      ) : null}
      {unknown.length > 0 ? (
        <p className="text-[11px] leading-relaxed text-warning">
          Нет в каталоге — время не считается: {unknown.join(", ")}. Уберите и выберите игру из списка.
        </p>
      ) : null}
    </div>
  );
}

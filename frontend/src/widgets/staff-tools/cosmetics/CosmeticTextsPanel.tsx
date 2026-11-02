import { useEffect, useMemo, useState } from "react";
import {
  fetchCosmeticTexts,
  resetCosmeticTexts,
  saveBadgeTexts,
  setCosmeticListed,
  type BadgeTexts,
  type CosmeticTexts,
} from "@/shared/api/cosmetic-texts";
import { formatApiError } from "@/shared/api/format-error";
import {
  Alert,
  BADGE_CATEGORY_LABEL,
  BadgeCard,
  BadgeIcon,
  Button,
  EmptyState,
  SectionLabel,
  SegmentedControl,
  Select,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  TextField,
  TileGrid,
  type BadgeCategory,
  type BadgeIconSpec,
} from "@/shared/ui";
import { PanelIntro } from "../panel-layout";
import { AppearanceTab } from "./AppearanceTab";
import { ReservePicker } from "./ReservePicker";
import { TitlesTab } from "./TitlesTab";

type Filter = "all" | BadgeCategory;

const CATEGORY_ORDER: BadgeCategory[] = ["role", "achievement", "event", "reward"];
const CATEGORY_PLURAL: Record<BadgeCategory, string> = {
  role: "Роли",
  achievement: "Достижения",
  event: "События",
  reward: "Награды",
};
const NAME_MAX = 32;
const DESCRIPTION_MAX = 160;
const HINT_MAX = 120;

/** Как в каталоге: подсказка под полем, когда правка отличается от исходного значения. */
function CatalogNote({ value, original }: { value: string; original: string | null }) {
  if (value.trim() === (original ?? "")) return null;
  return (
    <span className="text-[11px] text-muted">
      Как в каталоге: {original ? `«${original}»` : "без надписи"}
    </span>
  );
}

function sameTexts(a: BadgeTexts, b: BadgeTexts): boolean {
  return a.name === b.name && a.description === b.description && a.category === b.category && (a.hint ?? null) === (b.hint ?? null);
}

/** Форма одного значка: поля, превью «у получившего» и «с замком», сохранить / вернуть как в каталоге / убрать в запас. */
function BadgeEditor({
  id,
  icon,
  defaults,
  current,
  hasOverride,
  onSaved,
}: {
  id: string;
  icon: BadgeIconSpec;
  defaults: BadgeTexts;
  current: BadgeTexts;
  hasOverride: boolean;
  onSaved: (data: CosmeticTexts) => void;
}) {
  const [name, setName] = useState(current.name);
  const [description, setDescription] = useState(current.description);
  const [category, setCategory] = useState<BadgeCategory>(current.category);
  const [hint, setHint] = useState(current.hint ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleBadge = defaults.category === "role";

  const draft: BadgeTexts = { name: name.trim(), description: description.trim(), category, hint: hint.trim() || null };
  const invalid = !draft.name || !draft.description;
  const dirty = !sameTexts(draft, current);
  const preview = { id, icon, name: draft.name || defaults.name, category, description: draft.description || defaults.description, hint: draft.hint };

  async function run(action: () => Promise<CosmeticTexts>) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await action());
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message, "Не удалось сохранить") : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 border border-line bg-surface p-4">
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Название"
          value={name}
          maxLength={NAME_MAX}
          isDisabled={busy}
          onChange={setName}
          labelAside={`${name.length}/${NAME_MAX}`}
        />
        <CatalogNote value={name} original={defaults.name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Textarea
          label="Описание — за что выдан"
          value={description}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          showCount
          isDisabled={busy}
          onChange={setDescription}
        />
        <CatalogNote value={description} original={defaults.description} />
      </div>
      <Select
        label="Категория"
        value={category}
        isDisabled={busy || roleBadge}
        hint={roleBadge ? "Значок роли — категория фиксирована: он выдаётся только вместе с ролью." : undefined}
        options={(roleBadge ? (["role"] as BadgeCategory[]) : CATEGORY_ORDER.filter((c) => c !== "role")).map((c) => ({
          value: c,
          label: BADGE_CATEGORY_LABEL[c],
        }))}
        onChange={(value) => setCategory(value as BadgeCategory)}
      />
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Надпись у замка — как получить"
          value={hint}
          maxLength={HINT_MAX}
          placeholder="Необязательно"
          isDisabled={busy}
          onChange={setHint}
          labelAside={`${hint.length}/${HINT_MAX}`}
        />
        <CatalogNote value={hint} original={defaults.hint} />
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
        <div className="flex min-w-0 flex-col gap-2">
          <SectionLabel>У получившего</SectionLabel>
          <BadgeCard badge={preview} note="Получено 12.10.2026" noteIcon="check" className="border border-line bg-bg p-3" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <SectionLabel>У остальных</SectionLabel>
          <BadgeCard badge={preview} locked note={draft.hint ?? "Пока не получен"} noteIcon="lock" className="border border-line bg-bg p-3" />
        </div>
      </div>

      {error ? (
        <Alert tone="danger" compact>
          {error}
        </Alert>
      ) : null}
      <div className="-mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 pt-3">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon="eye-off"
          className={hasOverride ? undefined : "mr-auto"}
          isDisabled={busy}
          onPress={() => void run(() => setCosmeticListed("badge", id, false))}
        >
          Убрать в запас
        </Button>
        {hasOverride ? (
          <Button
            variant="ghost"
            size="sm"
            leadingIcon="refresh"
            className="mr-auto"
            isDisabled={busy}
            onPress={() => void run(() => resetCosmeticTexts("badge", id))}
          >
            Как в каталоге
          </Button>
        ) : null}
        <Button size="sm" isPending={busy} isDisabled={!dirty || invalid} onPress={() => void run(() => saveBadgeTexts(id, draft))}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}

function BadgesTab({ data, onSaved }: { data: CosmeticTexts; onSaved: (data: CosmeticTexts) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [picking, setPicking] = useState(false);
  // На витрине — видны в конструкторе всем; в запасе — только получившим. Здесь правится витрина, запас — через «Добавить».
  const shown = useMemo(() => data.badges.filter((badge) => badge.listed), [data]);
  const reserve = useMemo(
    () => data.badges.filter((badge) => !badge.listed).map((badge) => ({ ...badge, label: (badge.override ?? badge.defaults).name })),
    [data],
  );
  const [selectedId, setSelectedId] = useState<string | null>(shown[0]?.id ?? null);
  const effective = (badge: CosmeticTexts["badges"][number]) => badge.override ?? badge.defaults;
  const visible = shown.filter((badge) => filter === "all" || effective(badge).category === filter);
  const selected = shown.find((badge) => badge.id === selectedId) ?? visible[0];
  const filterOptions = useMemo(
    () => [
      { value: "all", label: `Все · ${shown.length}` },
      ...CATEGORY_ORDER.flatMap((category) => {
        const count = shown.filter((badge) => (badge.override ?? badge.defaults).category === category).length;
        return count > 0 ? [{ value: category, label: `${CATEGORY_PLURAL[category]} · ${count}` }] : [];
      }),
    ],
    [shown],
  );

  if (data.badges.length === 0) {
    return <EmptyState compact title="В каталоге пока нет значков." />;
  }
  return (
    <div className="flex flex-col gap-4">
      <PanelIntro
        action={
          <Button size="sm" variant="secondary" leadingIcon="plus" isDisabled={reserve.length === 0} onPress={() => setPicking(true)}>
            Из запаса · {reserve.length}
          </Button>
        }
      >
        Значки на витрине видны в конструкторе всем, в запасе — только получившим. Розовая точка — текст изменён здесь.
        Иконки и новые значки добавляются в каталоге сервера.
      </PanelIntro>
      <SegmentedControl
        aria-label="Категория значков"
        className="max-w-full self-start overflow-x-auto"
        value={filter}
        onChange={(value) => setFilter(value as Filter)}
        options={filterOptions}
      />
      <ReservePicker
        isOpen={picking}
        onClose={() => setPicking(false)}
        title="Добавить значок на витрину"
        items={reserve}
        renderArt={(badge) => (
          <span className="absolute inset-0 grid place-items-center">
            <BadgeIcon icon={badge.icon} size={32} />
          </span>
        )}
        onAdd={(badge) => setCosmeticListed("badge", badge.id, true)}
        onSaved={onSaved}
      />
      {shown.length === 0 ? <EmptyState compact title="На витрине пусто — значки видят только получившие." /> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <TileGrid
          label="Значки"
          className="grid-cols-[repeat(auto-fill,52px)] gap-2 sm:grid-cols-[repeat(auto-fill,52px)]"
          columns={{ base: 5, wide: 6 }}
          items={visible}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          getLabel={(badge) => effective(badge).name}
          getTooltip={(badge) => (badge.override ? `${effective(badge).name} · изменён` : effective(badge).name)}
          renderTile={(badge) => (
            <>
              <span className="absolute inset-0 grid place-items-center">
                <BadgeIcon icon={badge.icon} size={32} />
              </span>
              {badge.override ? <span aria-hidden="true" className="absolute right-0.5 top-0.5 size-1.5 bg-accent" /> : null}
            </>
          )}
        />
        {selected ? (
          <BadgeEditor
            key={`${selected.id}:${JSON.stringify(effective(selected))}`}
            id={selected.id}
            icon={selected.icon}
            defaults={selected.defaults}
            current={effective(selected)}
            hasOverride={selected.override !== null}
            onSaved={onSaved}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Витрина (только владелец): тексты значков поверх каталога сервера, титулы — свои и каталожные,
 * и что из косметики видно в конструкторе всем (витрина), а что — только получившим (запас).
 * Правка хранится на сервере и побеждает каталог; «вернуть» удаляет её. Иконки и набор значков — только в каталоге.
 */
export function CosmeticTextsPanel() {
  const [data, setData] = useState<CosmeticTexts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCosmeticTexts()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? formatApiError(e.message) : "Не удалось загрузить витрину");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return error ? (
      <Alert tone="danger" compact>
        {error}
      </Alert>
    ) : (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Tabs defaultSelectedKey="badges">
      <TabList aria-label="Витрина">
        <Tab id="badges">Значки</Tab>
        <Tab id="titles">Титулы</Tab>
        <Tab id="appearance">Оформление</Tab>
      </TabList>
      <TabPanel id="badges" className="pt-5">
        <BadgesTab data={data} onSaved={setData} />
      </TabPanel>
      <TabPanel id="titles" className="pt-5">
        <TitlesTab data={data} onSaved={setData} />
      </TabPanel>
      <TabPanel id="appearance" className="pt-5">
        <AppearanceTab data={data} onSaved={setData} />
      </TabPanel>
    </Tabs>
  );
}

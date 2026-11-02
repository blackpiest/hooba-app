import { useState, type ReactNode } from "react";
import { setCosmeticListed, type CosmeticTexts } from "@/shared/api/cosmetic-texts";
import { formatApiError } from "@/shared/api/format-error";
import { Alert, Button, ConfirmDialog, EmptyState, FieldGroup, TileGrid } from "@/shared/ui";
import { useAvatarStore } from "@/stores/avatar-store";
import { BackgroundTileArt, FrameTileArt } from "@/widgets/profile-edit/cosmetic-tiles";
import { PanelIntro } from "../panel-layout";
import { ReservePicker } from "./ReservePicker";

type Item = NonNullable<CosmeticTexts["items"]>[number];
type Kind = Item["kind"];

const SECTIONS: { kind: Kind; title: string; add: string }[] = [
  { kind: "frame", title: "Рамки", add: "Добавить рамку" },
  { kind: "background", title: "Фоны", add: "Добавить фон" },
  { kind: "character", title: "Персонажи", add: "Добавить персонажа" },
];

const TILE_GRID = "grid-cols-[repeat(auto-fill,64px)] gap-2 sm:grid-cols-[repeat(auto-fill,64px)]";

/** Миниатюра по спеке из каталога (`avatar-store`); каталог ещё не пришёл — подпись. */
function useItemArt(): (item: Item) => ReactNode {
  const catalog = useAvatarStore((s) => s.catalog);
  return (item) => {
    if (item.kind === "frame") {
      const spec = catalog?.frames.find((frame) => frame.id === item.id);
      if (spec) return <FrameTileArt spec={spec} />;
    } else if (item.kind === "background") {
      const spec = catalog?.backgrounds.find((background) => background.id === item.id);
      if (spec) return <BackgroundTileArt spec={spec} />;
    } else {
      const character = catalog?.characters.find((candidate) => candidate.id === item.id);
      if (character) {
        return <img src={character.head_url} alt="" draggable={false} loading="lazy" className="absolute inset-0 size-full object-cover" />;
      }
    }
    return <span className="absolute inset-0 grid place-items-center p-1 text-center text-[9px] text-muted">{item.label}</span>;
  };
}

/** Один вид: плитки витрины, «Убрать в запас» у выбранной и «Добавить» из запаса. */
function Section({
  kind,
  title,
  add,
  items,
  onSaved,
}: {
  kind: Kind;
  title: string;
  add: string;
  items: Item[];
  onSaved: (data: CosmeticTexts) => void;
}) {
  const art = useItemArt();
  const shown = items.filter((item) => item.listed);
  const reserve = items.filter((item) => !item.listed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = shown.find((item) => item.id === selectedId) ?? null;

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await setCosmeticListed(kind, removing.id, false));
      setSelectedId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message, "Не удалось убрать") : "Не удалось убрать");
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  return (
    <FieldGroup
      title={title}
      description={`На витрине ${shown.length} · в запасе ${reserve.length}`}
      aside={
        <Button size="sm" variant="secondary" leadingIcon="plus" isDisabled={reserve.length === 0} onPress={() => setPicking(true)}>
          Из запаса
        </Button>
      }
    >
      {error ? (
        <Alert tone="danger" compact>
          {error}
        </Alert>
      ) : null}
      {shown.length === 0 ? (
        <EmptyState compact title="На витрине пусто — в конструкторе их видят только получившие." />
      ) : (
        <TileGrid
          label={title}
          className={TILE_GRID}
          columns={{ base: 5, wide: 7 }}
          items={shown}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          getLabel={(item) => item.label}
          getTooltip={(item) => item.label}
          renderTile={art}
        />
      )}
      {selected ? (
        <div className="flex flex-wrap items-center gap-3 border border-line bg-surface py-2 pl-3 pr-2">
          <span className="min-w-0 flex-1 truncate text-sm">{selected.label}</span>
          <Button size="sm" variant="ghost" leadingIcon="eye-off" isDisabled={busy} onPress={() => setRemoving(selected)}>
            Убрать в запас
          </Button>
        </div>
      ) : null}
      <ReservePicker
        isOpen={picking}
        onClose={() => setPicking(false)}
        title={add}
        items={reserve}
        renderArt={art}
        onAdd={(item) => setCosmeticListed(kind, item.id, true)}
        onSaved={onSaved}
      />
      <ConfirmDialog
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        title="Убрать в запас?"
        description={`«${removing?.label ?? ""}» пропадёт из конструктора у всех, кто его не получил. Кто носит сейчас — сохранит.`}
        confirmLabel="Убрать"
        isPending={busy}
      />
    </FieldGroup>
  );
}

/**
 * Оформление (только владелец): какие рамки, фоны и персонажи видны в конструкторе всем, а какие «в запасе» —
 * только у получивших (выдача владельцем или награда испытания).
 */
export function AppearanceTab({ data, onSaved }: { data: CosmeticTexts; onSaved: (data: CosmeticTexts) => void }) {
  const items = data.items ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PanelIntro>
        Рамки, фоны и персонажи на витрине видны в конструкторе профиля всем. В запасе — только тем, кто их получил:
        от владельца или наградой испытания.
      </PanelIntro>
      {SECTIONS.map((section) => (
        <Section key={section.kind} {...section} items={items.filter((item) => item.kind === section.kind)} onSaved={onSaved} />
      ))}
    </div>
  );
}

import { useState, type ReactNode } from "react";
import type { CosmeticTexts } from "@/shared/api/cosmetic-texts";
import { formatApiError } from "@/shared/api/format-error";
import { Alert, Modal, TileGrid } from "@/shared/ui";

type Item = { id: string; label: string };

/**
 * Выбор из запаса: плитки предметов, которых нет на витрине. Клик — предмет уходит на витрину,
 * окно остаётся открытым, чтобы добавить несколько подряд.
 */
export function ReservePicker<T extends Item>({
  isOpen,
  onClose,
  title,
  items,
  renderArt,
  onAdd,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: T[];
  renderArt: (item: T) => ReactNode;
  onAdd: (item: T) => Promise<CosmeticTexts>;
  onSaved: (data: CosmeticTexts) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await onAdd(item));
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message, "Не удалось добавить") : "Не удалось добавить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle="В запасе — есть в базе, но в конструкторе профиля виден только тем, кто получил. Выберите, что показать всем."
      size="lg"
    >
      <div className="flex flex-col gap-3">
        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted">В запасе ничего не осталось — всё на витрине.</p>
        ) : (
          <TileGrid
            label={title}
            className="grid-cols-[repeat(auto-fill,64px)] gap-2 sm:grid-cols-[repeat(auto-fill,64px)]"
            columns={{ base: 5, wide: 7 }}
            items={items}
            selectedId={null}
            isDisabled={busy}
            onSelect={(id) => void add(id)}
            getLabel={(item) => `Добавить «${item.label}»`}
            getTooltip={(item) => item.label}
            renderTile={renderArt}
          />
        )}
      </div>
    </Modal>
  );
}

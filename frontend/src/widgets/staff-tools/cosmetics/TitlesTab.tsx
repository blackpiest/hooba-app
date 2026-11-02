import { useState, type ReactNode } from "react";
import {
  createTitle,
  deleteTitle,
  resetCosmeticTexts,
  restoreTitle,
  saveTitleTexts,
  setCosmeticListed,
  type CosmeticTexts,
  type CosmeticTitle,
} from "@/shared/api/cosmetic-texts";
import { formatApiError } from "@/shared/api/format-error";
import {
  Alert,
  BadgeIcon,
  Button,
  ConfirmDialog,
  EmptyState,
  FieldGroup,
  IconButton,
  Select,
  TextField,
  Tooltip,
  type BadgeIconSpec,
  type SelectOption,
} from "@/shared/ui";
import { cx } from "@/utils/cx";
import { PanelIntro } from "../panel-layout";
import { ReservePicker } from "./ReservePicker";

const TITLE_MAX = 32;
/** Значение Select для «без иконки»: id значков такого не бывает. */
const NO_BADGE = "-";

type Badges = CosmeticTexts["badges"];

function badgeOptions(badges: Badges): SelectOption[] {
  return [
    { value: NO_BADGE, label: "Без иконки" },
    ...badges.map((badge) => ({
      value: badge.id,
      label: (
        <span className="flex items-center gap-2">
          <BadgeIcon icon={badge.icon} size={16} />
          {(badge.override ?? badge.defaults).name}
        </span>
      ),
    })),
  ];
}

function TitleIcon({ icon }: { icon: BadgeIconSpec | undefined }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center border border-line bg-bg">
      {icon ? <BadgeIcon icon={icon} size={20} /> : <span className="font-heading text-[10px] text-muted">Аа</span>}
    </span>
  );
}

/** Ошибка и «занято» на время запроса; результат — новый список витрины. */
function useAction(onSaved: (data: CosmeticTexts) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<CosmeticTexts>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      onSaved(await action());
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message, "Не удалось сохранить") : "Не удалось сохранить");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

/** Строка титула: иконка, поля и кнопки на одной линии; пояснения и ошибка — под строкой. */
function TitleShell({
  icon,
  children,
  actions,
  notes,
  className,
}: {
  icon: BadgeIconSpec | undefined;
  children: ReactNode;
  actions: ReactNode;
  notes?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-2 border border-line bg-surface p-3", className)}>
      <div className="flex flex-wrap items-end gap-3">
        <TitleIcon icon={icon} />
        {children}
        {/* Высота поля — 44px: кнопки центрируются по нему, а не прижимаются к низу. */}
        <div className="flex h-11 items-center gap-1.5">{actions}</div>
      </div>
      {notes}
    </div>
  );
}

function Notes({ catalogLabel, error }: { catalogLabel?: string | null; error: string | null }) {
  if (!catalogLabel && !error) return null;
  return (
    <div className="flex flex-col gap-0.5 pl-14">
      {catalogLabel ? <p className="text-[11px] leading-relaxed text-muted">Как в каталоге: «{catalogLabel}»</p> : null}
      {error ? <p className="text-[11px] leading-relaxed text-danger">{error}</p> : null}
    </div>
  );
}

/** Подпись и значок: общие поля строки титула и формы нового. */
function TitleFields({
  label,
  badge,
  badges,
  busy,
  onLabel,
  onBadge,
}: {
  label: string;
  badge: string | null;
  badges: Badges;
  busy: boolean;
  onLabel: (value: string) => void;
  onBadge: (value: string | null) => void;
}) {
  return (
    <>
      <TextField
        label="Подпись под именем"
        className="min-w-48 flex-1"
        value={label}
        maxLength={TITLE_MAX}
        isDisabled={busy}
        onChange={onLabel}
        labelAside={`${label.length}/${TITLE_MAX}`}
      />
      <Select
        label="Иконка"
        className="w-48"
        value={badge ?? NO_BADGE}
        isDisabled={busy}
        options={badgeOptions(badges)}
        onChange={(value) => onBadge(value === NO_BADGE ? null : value)}
      />
    </>
  );
}

function NewTitleForm({ badges, onSaved, onDone }: { badges: Badges; onSaved: (data: CosmeticTexts) => void; onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [badge, setBadge] = useState<string | null>(null);
  const { busy, error, run } = useAction(onSaved);
  const icon = badges.find((item) => item.id === badge)?.icon;
  const trimmed = label.trim();

  return (
    <TitleShell
      icon={icon}
      className="border-accent/40"
      notes={<Notes error={error} />}
      actions={
        <>
          <Button variant="ghost" size="sm" isDisabled={busy} onPress={onDone}>
            Отмена
          </Button>
          <Button
            size="sm"
            isPending={busy}
            isDisabled={!trimmed}
            onPress={() => void run(() => createTitle({ label: trimmed, badge })).then((ok) => ok && onDone())}
          >
            Создать
          </Button>
        </>
      }
    >
      <TitleFields label={label} badge={badge} badges={badges} busy={busy} onLabel={setLabel} onBadge={setBadge} />
    </TitleShell>
  );
}

/** Строка титула: подпись и иконка, сохранить / вернуть как в каталоге / в запас / удалить (каталожный — скрыть). */
function TitleRow({
  title,
  badges,
  onSaved,
  onRemove,
}: {
  title: CosmeticTitle;
  badges: Badges;
  onSaved: (data: CosmeticTexts) => void;
  onRemove: (title: CosmeticTitle) => void;
}) {
  const [label, setLabel] = useState(title.current.label);
  const [badge, setBadge] = useState(title.current.badge);
  const { busy, error, run } = useAction(onSaved);
  const trimmed = label.trim();
  const dirty = trimmed !== title.current.label || badge !== title.current.badge;
  const icon = badges.find((item) => item.id === badge)?.icon;
  const custom = title.source === "custom";

  const catalogLabel = title.defaults?.label;
  return (
    <TitleShell
      icon={icon}
      className={title.override ? "border-accent/40" : undefined}
      notes={<Notes catalogLabel={catalogLabel !== undefined && trimmed !== catalogLabel ? catalogLabel : null} error={error} />}
      actions={
        <>
          {title.override ? (
            <Tooltip content="Вернуть как в каталоге">
              <IconButton
                icon="refresh"
                label="Вернуть как в каталоге"
                isDisabled={busy}
                onPress={() => void run(() => resetCosmeticTexts("title", title.id))}
              />
            </Tooltip>
          ) : null}
          <Tooltip content="Убрать в запас: в конструкторе — только у получивших">
            <IconButton
              icon="eye-off"
              label="Убрать в запас"
              isDisabled={busy}
              onPress={() => void run(() => setCosmeticListed("title", title.id, false))}
            />
          </Tooltip>
          <Tooltip content={custom ? "Удалить титул" : "Скрыть титул"}>
            <IconButton
              icon="trash"
              variant="danger"
              label={custom ? "Удалить титул" : "Скрыть титул"}
              isDisabled={busy}
              onPress={() => onRemove(title)}
            />
          </Tooltip>
          <Button
            size="sm"
            className="ml-1.5"
            isPending={busy}
            isDisabled={!trimmed || !dirty}
            onPress={() => void run(() => saveTitleTexts(title.id, { label: trimmed, badge }))}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <TitleFields label={label} badge={badge} badges={badges} busy={busy} onLabel={setLabel} onBadge={setBadge} />
    </TitleShell>
  );
}

function HiddenRow({ title, badges, onSaved }: { title: CosmeticTitle; badges: Badges; onSaved: (data: CosmeticTexts) => void }) {
  const { busy, error, run } = useAction(onSaved);
  return (
    <div className="flex flex-wrap items-center gap-3 border border-line px-3 py-2">
      <span className="opacity-60">
        <TitleIcon icon={badges.find((item) => item.id === title.current.badge)?.icon} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{title.current.label}</span>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
      <Button variant="secondary" size="sm" leadingIcon="eye" isPending={busy} onPress={() => void run(() => restoreTitle(title.id))}>
        Вернуть
      </Button>
    </div>
  );
}

/**
 * Титулы (только владелец): свои создаются и удаляются здесь, каталожные можно переименовать и скрыть.
 * Удалённый свой титул снимается со всех; скрытый каталожный пропадает, пока его не вернут.
 */
export function TitlesTab({ data, onSaved }: { data: CosmeticTexts; onSaved: (data: CosmeticTexts) => void }) {
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<CosmeticTitle | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const visible = data.titles.filter((title) => !title.hidden && title.listed);
  const reserve = data.titles.filter((title) => !title.hidden && !title.listed).map((title) => ({ ...title, label: title.current.label }));
  const hidden = data.titles.filter((title) => title.hidden);

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      onSaved(await deleteTitle(removing.id));
      setRemoving(null);
    } catch (e: unknown) {
      setRemoveError(e instanceof Error ? formatApiError(e.message, "Не удалось удалить") : "Не удалось удалить");
      setRemoving(null);
    } finally {
      setRemoveBusy(false);
    }
  }

  const custom = removing?.source === "custom";
  return (
    <div className="flex flex-col gap-4">
      <PanelIntro
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" leadingIcon="plus" isDisabled={reserve.length === 0} onPress={() => setPicking(true)}>
              Из запаса · {reserve.length}
            </Button>
            <Button size="sm" leadingIcon="plus" isDisabled={creating} onPress={() => setCreating(true)}>
              Новый титул
            </Button>
          </div>
        }
      >
        Розовая рамка — подпись или иконка изменены здесь. Титулы из каталога не удаляются, а скрываются — их можно
        вернуть. Титул в запасе остаётся у получивших, но в конструкторе его видят только они.
      </PanelIntro>
      <div className="flex flex-col gap-2">
      {creating ? <NewTitleForm badges={data.badges} onSaved={onSaved} onDone={() => setCreating(false)} /> : null}
      <ReservePicker
        isOpen={picking}
        onClose={() => setPicking(false)}
        title="Добавить титул на витрину"
        items={reserve}
        renderArt={(title) => {
          const icon = data.badges.find((item) => item.id === title.current.badge)?.icon;
          return (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1 text-center">
              {icon ? <BadgeIcon icon={icon} size={20} /> : null}
              <span className="line-clamp-2 text-[9px] leading-tight">{title.label}</span>
            </span>
          );
        }}
        onAdd={(title) => setCosmeticListed("title", title.id, true)}
        onSaved={onSaved}
      />
      {removeError ? (
        <Alert tone="danger" compact>
          {removeError}
        </Alert>
      ) : null}
      {visible.length === 0 && !creating ? <EmptyState compact title="Титулов на витрине нет." /> : null}
      {visible.map((title) => (
        <TitleRow
          key={`${title.id}:${title.current.label}:${title.current.badge ?? ""}`}
          title={title}
          badges={data.badges}
          onSaved={onSaved}
          onRemove={(target) => {
            setRemoveError(null);
            setRemoving(target);
          }}
        />
      ))}
      </div>
      {hidden.length > 0 ? (
        <FieldGroup title={`Скрытые · ${hidden.length}`} description="Пропали из профилей и выдачи; выданное вернётся вместе с титулом." className="mt-2">
          <div className="flex flex-col gap-2">
            {hidden.map((title) => (
              <HiddenRow key={title.id} title={title} badges={data.badges} onSaved={onSaved} />
            ))}
          </div>
        </FieldGroup>
      ) : null}
      <ConfirmDialog
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={custom ? "Удалить титул?" : "Скрыть титул?"}
        description={
          custom
            ? removing && removing.holders > 0
              ? `«${removing.current.label}» снимется у участников: ${removing.holders}. Вернуть не получится.`
              : `«${removing?.current.label ?? ""}» удалится насовсем.`
            : `«${removing?.current.label ?? ""}» пропадёт из профилей и выдачи. Выданное сохранится и вернётся вместе с титулом.`
        }
        confirmLabel={custom ? "Удалить" : "Скрыть"}
        tone="danger"
        isPending={removeBusy}
      />
    </div>
  );
}

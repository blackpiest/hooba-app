import { useEffect, useMemo, useState, type Key } from "react";
import {
  getEditorMusicEnabled,
  playCosmeticSelectSound,
  playCosmeticTickSound,
  setEditorMusicEnabled,
  startEditorMusic,
} from "@/features/ui-sounds/ui-sounds";
import { updateMyAvatar, type CosmeticLock, type UserAvatar } from "@/shared/api/avatars";
import { fetchMyCosmetics, markCosmeticSeen, updateMyShowcase, type Showcase, type UserCosmetics } from "@/shared/api/badges";
import type { CosmeticKind } from "@/shared/api/challenges";
import { formatApiError } from "@/shared/api/format-error";
import { updateMyDisplayName } from "@/shared/api/users";
import {
  DISPLAY_NAME_ERROR_TEXT,
  DISPLAY_NAME_MAX_LENGTH,
  normalizeDisplayName,
} from "@/shared/lib/display-name";
import {
  Alert,
  BASE_FRAME_LABEL,
  Button,
  Modal,
  ProfileCardFrame,
  ProfileCardWindow,
  Spinner,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextField,
  TileGrid,
  UnreadDot,
} from "@/shared/ui";
import {
  resolveProfileCosmetics,
  resolveShowcase,
  sameAvatar,
  useAvatarStore,
} from "@/stores/avatar-store";
import { useChallengeStore } from "@/stores/challenge-store";
import { useMemberProfileStore } from "@/stores/member-profile-store";
import { usePresenceStore } from "@/stores/presence-store";
import { useProfileNewsStore } from "@/stores/profile-news-store";
import { useUserStore } from "@/stores/user-store";
import { cx } from "@/utils/cx";
import { RoleList, ShowcaseBadges, ShowcaseTitle, StatusPlate } from "@/widgets/user-profile-card";
import { BadgesPanel } from "./BadgesPanel";
import { BackgroundTileArt, FrameTileArt, LockedTileOverlay, NewTileMark, ReservedTileMark } from "./cosmetic-tiles";
import { TitlesPanel } from "./TitlesPanel";
import { ChallengesPanel } from "./ChallengesPanel";

const EMPTY: UserAvatar = { character: null, background: null, frame: null };
/** Плитка «нет» в сетках: в косметике это null. id каталога не может начинаться с «_», так что совпадения нет. */
const NONE = "_none";
/** Сетка плиток 64px: колонки для стрелок ↑/↓ задаются по ширине панели, тут — разумное приближение. */
const TILE_GRID = "grid-cols-[repeat(auto-fill,64px)] gap-2 sm:grid-cols-[repeat(auto-fill,64px)]";
const TILE_COLUMNS = { base: 5, wide: 7 };
/**
 * Вкладка занимает всю свободную высоту окна (оно постоянной высоты), длинное содержимое прокручивается внутри.
 * На узком экране — своя постоянная высота: `flex-none`, иначе `flex-1` из кита перебивает `h-*`. Поля по бокам — под обводку плитки.
 */
const TAB_PANEL = "-mx-1.5 h-[22rem] flex-none overflow-y-auto px-1.5 pt-4 md:h-auto md:min-h-0 md:flex-1";

export type ProfileEditTab = "character" | "background" | "frame" | "title" | "badges" | "challenges";
type TabId = ProfileEditTab;
type CosmeticSlot = "frame" | "background" | "character";

function isEmpty(avatar: UserAvatar): boolean {
  return avatar.character === null && avatar.background === null && avatar.frame === null;
}

/** Рамка, фон, персонаж «в запасе» в конструкторе только у тех, кому открыт (получил или владелец). */
function shownInEditor(item: CosmeticLock): boolean {
  return item.listed !== false || !item.locked;
}

function cosmeticKey(kind: CosmeticKind, id: string): string {
  return `${kind}:${id}`;
}

/** Ключи `cosmeticKey` выданных, но ещё не нажатых предметов (метка «Новое»). */
function unseenKeys(cosmetics: UserCosmetics | null): Set<string> {
  if (!cosmetics) {
    return new Set();
  }
  return new Set([
    ...cosmetics.badges.filter((item) => item.new).map((item) => cosmeticKey("badge", item.id)),
    ...cosmetics.titles.filter((item) => item.new).map((item) => cosmeticKey("title", item.id)),
    ...(cosmetics.items ?? []).filter((item) => item.new).map((item) => cosmeticKey(item.kind, item.id)),
  ]);
}

/** id предметов одного вида из ключей `cosmeticKey`. */
function idsOfKind(keys: ReadonlySet<string>, kind: CosmeticKind): Set<string> {
  const prefix = `${kind}:`;
  return new Set([...keys].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)));
}

function sameShowcase(a: Showcase, b: Showcase): boolean {
  return a.title === b.title && a.badges.join(",") === b.badges.join(",");
}

/** Превью — та же карточка, что видят другие участники, без интерактивных элементов. */
function ProfilePreview({
  userId,
  name,
  username,
  avatar,
  showcase,
}: {
  userId: number;
  name: string;
  username: string;
  avatar: UserAvatar;
  showcase: Showcase;
}) {
  const catalog = useAvatarStore((s) => s.catalog);
  const status = usePresenceStore((s) => s.statusByUserId[userId] ?? "online");
  const cosmetics = useMemo(() => resolveProfileCosmetics(catalog, avatar), [catalog, avatar]);
  const resolved = useMemo(() => resolveShowcase(catalog, showcase), [catalog, showcase]);
  return (
    <div className="w-[264px] border border-brand/60 bg-bg p-2 text-fg shadow-pop max-md:w-[210px]" aria-label="Превью профиля">
      <ProfileCardFrame
        skin={cosmetics?.frame}
        title={<span className="block truncate">{name}</span>}
        subtitle={resolved.title ? <ShowcaseTitle showcase={resolved} /> : null}
        overlay={resolved.badges.length > 0 ? <ShowcaseBadges showcase={resolved} /> : null}
        username={`@${username}`}
        status={<StatusPlate status={status} selfPreference={null} onPresence={() => undefined} />}
      >
        <ProfileCardWindow
          background={cosmetics?.background ?? null}
          character={cosmetics?.character ?? null}
          fallbackInitial={name.slice(0, 1).toUpperCase() || "?"}
        />
      </ProfileCardFrame>
      <div className="px-1.5 pb-1 pt-3 empty:hidden">
        <RoleList userId={userId} username={username} isSelf />
      </div>
    </div>
  );
}

/** Значки и титулы грузятся отдельно от каталога: что выдано именно мне. */
function useMyCosmetics(): { cosmetics: UserCosmetics | null; failed: boolean } {
  const [cosmetics, setCosmetics] = useState<UserCosmetics | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchMyCosmetics()
      .then((data) => {
        if (!cancelled) setCosmetics(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { cosmetics, failed };
}

/**
 * Конструктор профиля: имя и вкладки косметики (персонаж, фон, рамка, титул, значки) с живым превью карточки.
 * Рамка, фон и персонаж выбираются сетками плиток; закрытые рамки видны с замком.
 */
export function ProfileEditDialog({
  userId,
  username,
  displayName,
  avatar,
  initialTab = "character",
  onClose,
}: {
  userId: number;
  username: string;
  displayName: string | null;
  avatar: UserAvatar | null;
  /** С какой вкладки открыть (подсказка о новом испытании ведёт сразу в «Испытания»). */
  initialTab?: ProfileEditTab;
  onClose: () => void;
}) {
  const catalog = useAvatarStore((s) => s.catalog);
  const [draft, setDraft] = useState<UserAvatar>(avatar ?? EMPTY);
  const [nameDraft, setNameDraft] = useState(displayName ?? "");
  const [tab, setTab] = useState<TabId>(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Отказ сервера по имени (фильтр слов) — показываем под полем, а не общим сообщением.
  const [nameServerError, setNameServerError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { cosmetics, failed: cosmeticsFailed } = useMyCosmetics();
  const savedShowcase = useMemo<Showcase>(
    () => ({ badges: cosmetics?.pinned_badges ?? [], title: cosmetics?.title ?? null }),
    [cosmetics],
  );
  const [showcaseDraft, setShowcaseDraft] = useState<Showcase | null>(null);
  const showcase = showcaseDraft ?? savedShowcase;

  useEffect(() => {
    if (catalog) {
      return;
    }
    let cancelled = false;
    void useAvatarStore
      .getState()
      .loadCatalog()
      .then(() => {
        if (!cancelled && !useAvatarStore.getState().catalog) {
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [catalog]);

  // Прогресс испытаний: нужен вкладке «Испытания» и подсказкам «как открыть» у закрытой косметики.
  useEffect(() => {
    void useChallengeStore.getState().load();
  }, []);

  // Новые испытания запоминаем до отметки «просмотрено» ниже: метки «Новое» держатся, пока открыт конструктор.
  const [newChallenges] = useState(() => new Set(useProfileNewsStore.getState().news?.challenge_ids ?? []));
  const [challengesVisited, setChallengesVisited] = useState(initialTab === "challenges");

  // Метка «Новое» у предмета снимается нажатием на него; `seen` — нажатые за этот раз, чтобы не ждать сервер.
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const fresh = useMemo(() => {
    const keys = unseenKeys(cosmetics);
    for (const key of seen) keys.delete(key);
    return keys;
  }, [cosmetics, seen]);
  const freshBadges = useMemo(() => idsOfKind(fresh, "badge"), [fresh]);
  const freshTitles = useMemo(() => idsOfKind(fresh, "title"), [fresh]);

  function markSeen(kind: CosmeticKind, id: string) {
    const key = cosmeticKey(kind, id);
    if (!fresh.has(key)) {
      return;
    }
    setSeen((current) => new Set(current).add(key));
    // Не дошло — метка вернётся при следующем открытии конструктора.
    void markCosmeticSeen(kind, id).catch(() => undefined);
  }

  /** Точка на вкладке: в ней есть новое. */
  function tabDot(kind: CosmeticKind | "challenges") {
    const has = kind === "challenges" ? !challengesVisited && newChallenges.size > 0 : idsOfKind(fresh, kind).size > 0;
    return has ? <UnreadDot label="Есть новое" /> : null;
  }

  // Открытый конструктор — новинки увидены: подсказка у кнопки профиля пропадает (и на других устройствах).
  useEffect(() => {
    useProfileNewsStore.getState().markSeen();
  }, []);

  const [musicOn, setMusicOn] = useState(getEditorMusicEnabled);

  useEffect(() => {
    if (!musicOn) {
      return;
    }
    return startEditorMusic();
  }, [musicOn]);

  const saved = isEmpty(draft) ? null : draft;
  const avatarDirty = !sameAvatar(saved, avatar);
  const showcaseDirty = cosmetics !== null && !sameShowcase(showcase, savedShowcase);
  // Имя скрыто модерацией: поле заблокировано, в превью — логин. Флаг приходит в `me` и `user:updated`.
  const nameLocked = useUserStore((s) => s.me?.id === userId && (s.me.display_name_locked ?? false));
  const name = normalizeDisplayName(nameDraft);
  const nameError = nameLocked ? null : name.ok ? nameServerError : DISPLAY_NAME_ERROR_TEXT[name.error];
  const nameDirty = !nameLocked && name.ok && name.value !== displayName;
  const nameLength = nameLocked ? 0 : [...nameDraft.trim()].length;
  const previewName = (!nameLocked && name.ok && name.value) || username;

  // Владелец видит и запас (у него открыто всё) — с пометкой, чтобы отличать от витрины.
  const isOwner = useUserStore((s) => s.me?.roles.includes("OWNER") ?? false);
  // Рамки и фоны целиком приходят из каталога сервера. Закрытая рамка видна с замком: так понятно, что её можно получить.
  // Закрытая «в запасе» не показывается вовсе: её не получить, пока владелец не выдаст.
  const frameTiles = useMemo(
    () => [
      { id: NONE, label: BASE_FRAME_LABEL, locked: false, reserved: false, challengeIds: [] as number[], spec: null },
      ...(catalog?.frames ?? []).filter(shownInEditor).map((item) => ({
        id: item.id,
        label: item.label,
        locked: item.locked ?? false,
        reserved: item.listed === false,
        challengeIds: item.challenge_ids ?? [],
        spec: item,
      })),
    ],
    [catalog],
  );
  const backgroundTiles = useMemo(
    () => [
      { id: NONE, label: "Без фона", locked: false, reserved: false, challengeIds: [] as number[], spec: null },
      ...(catalog?.backgrounds ?? []).filter(shownInEditor).map((item) => ({
        id: item.id,
        label: item.label,
        locked: item.locked ?? false,
        reserved: item.listed === false,
        challengeIds: item.challenge_ids ?? [],
        spec: item,
      })),
    ],
    [catalog],
  );
  const knownFrame = catalog?.frames.some((item) => item.id === draft.frame) ?? false;
  const knownBackground = catalog?.backgrounds.some((item) => item.id === draft.background) ?? false;
  const characterTiles = useMemo(
    () => [
      { id: NONE, name: "Без персонажа", head_url: "", locked: false, reserved: false, challengeIds: [] as number[] },
      ...(catalog?.characters ?? []).filter(shownInEditor).map((item) => ({
        id: item.id,
        name: item.name,
        head_url: item.head_url,
        locked: item.locked ?? false,
        reserved: item.listed === false,
        challengeIds: item.challenge_ids ?? [],
      })),
    ],
    [catalog],
  );
  // Значки и титулы «в запасе» — только полученные (у владельца получено всё).
  const editorBadges = useMemo(() => {
    const owned = new Set((cosmetics?.badges ?? []).map((item) => item.id));
    return (catalog?.badges ?? []).filter((item) => item.listed !== false || owned.has(item.id));
  }, [catalog, cosmetics]);
  const editorTitles = useMemo(() => {
    const owned = new Set((cosmetics?.titles ?? []).map((item) => item.id));
    return (catalog?.titles ?? []).filter((item) => item.listed !== false || owned.has(item.id));
  }, [catalog, cosmetics]);
  const reserved = useMemo(
    () =>
      isOwner
        ? new Set([...(catalog?.badges ?? []), ...(catalog?.titles ?? [])].filter((item) => item.listed === false).map((item) => item.id))
        : undefined,
    [catalog, isOwner],
  );

  const canSave = !busy && !nameError && (nameDirty || (avatarDirty && !!catalog) || showcaseDirty);

  /**
   * Клик по плитке рамки, фона или персонажа. Открытая выбирается (и видна в превью); закрытая — нет:
   * только звук «недоступно». Предыдущий выбор остаётся.
   */
  function pickCosmetic(slot: CosmeticSlot, id: string, locked: boolean) {
    playCosmeticSelectSound(locked, slot === "character" ? "character" : "other");
    markSeen(slot, id);
    if (!locked) {
      patchDraft({ [slot]: id === NONE ? null : id } as Partial<UserAvatar>);
    }
  }

  function patchDraft(patch: Partial<UserAvatar>) {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  function patchShowcase(patch: Partial<Showcase>) {
    setError(null);
    setShowcaseDraft({ ...showcase, ...patch });
  }

  function patchMe(patch: { avatar?: UserAvatar | null; display_name?: string | null; badges?: string[]; title?: string | null }) {
    const current = useUserStore.getState().me;
    if (current && current.id === userId) {
      useUserStore.getState().setMe({ ...current, ...patch });
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    // Поля сохраняются по отдельности: при ошибке следующего уже применённое есть в `me` и не уйдёт повторно.
    let fallback = "Не удалось сохранить оформление";
    try {
      if (avatarDirty && catalog) {
        const result = await updateMyAvatar(saved);
        useAvatarStore.getState().setAvatar(userId, result.avatar);
        patchMe({ avatar: result.avatar });
      }
      if (showcaseDirty) {
        fallback = "Не удалось сохранить значки и титул";
        const result = await updateMyShowcase(showcase);
        useAvatarStore.getState().setShowcase(userId, { badges: result.pinned_badges, title: result.title });
        patchMe({ badges: result.pinned_badges, title: result.title });
      }
      if (nameDirty) {
        fallback = "Не удалось сохранить имя";
        const result = await updateMyDisplayName(name.value);
        useMemberProfileStore.getState().setDisplayName(userId, result.display_name);
        patchMe({ display_name: result.display_name });
      }
      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? formatApiError(e.message, fallback) : fallback;
      if (
        e instanceof Error &&
        (e.message.startsWith("DISPLAY_NAME_FORBIDDEN") || e.message.startsWith("DISPLAY_NAME_TAKEN"))
      ) {
        setNameServerError(message);
      } else {
        setError(message);
      }
      setBusy(false);
    }
  }

  const cosmeticsPending = !cosmetics ? (
    cosmeticsFailed ? (
      <Alert tone="danger" compact>
        Не удалось загрузить значки и титулы.
      </Alert>
    ) : (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  ) : null;

  return (
    <Modal
      isOpen
      size="2xl"
      fixedHeight
      title="Редактирование профиля"
      isDismissable={!busy}
      onClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      footer={
        <>
          <Switch
            className="mr-auto"
            isSelected={musicOn}
            onChange={(value) => {
              setMusicOn(value);
              setEditorMusicEnabled(value);
            }}
          >
            Музыка в редакторе
          </Switch>
          <Button variant="ghost" isDisabled={busy} onPress={onClose}>
            Отмена
          </Button>
          <Button
            isDisabled={!canSave}
            isPending={busy}
            onPress={() => {
              void save();
            }}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 md:h-full">
        <div className="grid items-start gap-6 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1fr)_300px] md:grid-rows-[minmax(0,1fr)] md:items-stretch">
          <div className="flex min-w-0 flex-col gap-5 md:min-h-0">
            <TextField
              label="Отображаемое имя"
              value={nameLocked ? "" : nameDraft}
              onChange={(value) => {
                setError(null);
                setNameServerError(null);
                setNameDraft(value);
              }}
              maxLength={DISPLAY_NAME_MAX_LENGTH * 2}
              placeholder={username}
              autoComplete="off"
              spellCheck="false"
              isDisabled={busy || nameLocked}
              error={nameError}
              hint={
                nameLocked
                  ? "Администрация скрыла ваше имя. Сменить его пока нельзя."
                  : "Видно всем участникам. Если оставить пустым — будет показан никнейм."
              }
              labelAside={
                <span className={nameLength > DISPLAY_NAME_MAX_LENGTH ? "text-danger" : undefined}>
                  {nameLength}/{DISPLAY_NAME_MAX_LENGTH}
                </span>
              }
            />

            {!catalog ? (
              loadFailed ? (
                <Alert tone="danger" compact>
                  Не удалось загрузить оформление профиля.
                </Alert>
              ) : (
                <div className="flex min-h-40 items-center justify-center">
                  <Spinner size="lg" />
                </div>
              )
            ) : (
              <Tabs
                className="md:min-h-0 md:flex-1"
                selectedKey={tab}
                onSelectionChange={(key: Key) => {
                  setTab(key as TabId);
                  if (key === "challenges") {
                    setChallengesVisited(true);
                  }
                }}
              >
                <TabList aria-label="Оформление профиля" className="overflow-x-auto">
                  <Tab id="character">Персонаж{tabDot("character")}</Tab>
                  <Tab id="background">Фон{tabDot("background")}</Tab>
                  <Tab id="frame">Рамка{tabDot("frame")}</Tab>
                  <Tab id="title">Титул{tabDot("title")}</Tab>
                  <Tab id="badges">Значки{tabDot("badge")}</Tab>
                  <Tab id="challenges">Испытания{tabDot("challenges")}</Tab>
                </TabList>

                <TabPanel id="frame" className={cx(TAB_PANEL, "flex flex-col gap-3")}>
                  <TileGrid
                    label="Рамка"
                    className={TILE_GRID}
                    columns={TILE_COLUMNS}
                    items={frameTiles}
                    selectedId={knownFrame && draft.frame ? draft.frame : NONE}
                    isDisabled={busy}
                    isItemLocked={(item) => item.locked}
                    onSelect={(id) => pickCosmetic("frame", id, frameTiles.some((item) => item.id === id && item.locked))}
                    getLabel={(item) =>
                      item.locked ? `${item.label} (закрыта)` : fresh.has(cosmeticKey("frame", item.id)) ? `${item.label} (новое)` : item.label
                    }
                    getTooltip={(item) => item.label}
                    renderTile={(item) => (
                      <>
                        <FrameTileArt spec={item.spec} />
                        {item.locked ? <LockedTileOverlay /> : null}
                        {fresh.has(cosmeticKey("frame", item.id)) ? <NewTileMark /> : null}
                        {isOwner && item.reserved ? <ReservedTileMark /> : null}
                      </>
                    )}
                  />
                </TabPanel>

                <TabPanel id="background" className={cx(TAB_PANEL, "flex flex-col gap-3")}>
                  <TileGrid
                    label="Фон"
                    className={TILE_GRID}
                    columns={TILE_COLUMNS}
                    items={backgroundTiles}
                    selectedId={knownBackground && draft.background ? draft.background : NONE}
                    isDisabled={busy}
                    isItemLocked={(item) => item.locked}
                    onSelect={(id) =>
                      pickCosmetic("background", id, backgroundTiles.some((item) => item.id === id && item.locked))
                    }
                    getLabel={(item) =>
                      item.locked ? `${item.label} (закрыт)` : fresh.has(cosmeticKey("background", item.id)) ? `${item.label} (новое)` : item.label
                    }
                    getTooltip={(item) => item.label}
                    renderTile={(item) => (
                      <>
                        <BackgroundTileArt spec={item.spec} />
                        {item.locked ? <LockedTileOverlay /> : null}
                        {fresh.has(cosmeticKey("background", item.id)) ? <NewTileMark /> : null}
                        {isOwner && item.reserved ? <ReservedTileMark /> : null}
                      </>
                    )}
                  />
                </TabPanel>

                <TabPanel id="character" className={cx(TAB_PANEL, "flex flex-col gap-3")}>
                  <TileGrid
                    label="Персонаж"
                    className={TILE_GRID}
                    columns={TILE_COLUMNS}
                    items={characterTiles}
                    selectedId={draft.character ?? NONE}
                    isDisabled={busy}
                    isItemLocked={(item) => item.locked}
                    onSelect={(id) =>
                      pickCosmetic("character", id, characterTiles.some((item) => item.id === id && item.locked))
                    }
                    getLabel={(item) =>
                      item.locked ? `${item.name} (закрыт)` : fresh.has(cosmeticKey("character", item.id)) ? `${item.name} (новое)` : item.name
                    }
                    getTooltip={(item) => item.name}
                    renderTile={(item) =>
                      item.id === NONE ? (
                        <span className="grid size-full place-items-center font-heading text-xl text-muted">
                          {previewName.slice(0, 1).toUpperCase() || "?"}
                        </span>
                      ) : (
                        <>
                          <img
                            src={item.head_url}
                            alt=""
                            draggable={false}
                            loading="lazy"
                            className="absolute inset-0 size-full object-cover"
                          />
                          {item.locked ? <LockedTileOverlay /> : null}
                          {fresh.has(cosmeticKey("character", item.id)) ? <NewTileMark /> : null}
                          {isOwner && item.reserved ? <ReservedTileMark /> : null}
                        </>
                      )
                    }
                  />
                </TabPanel>

                <TabPanel id="title" className={TAB_PANEL}>
                  {cosmeticsPending ?? (
                    <TitlesPanel
                      titles={editorTitles}
                      badges={catalog.badges}
                      reserved={reserved}
                      owned={cosmetics?.titles ?? []}
                      fresh={freshTitles}
                      value={showcase.title}
                      onChange={(title) => {
                        playCosmeticTickSound();
                        if (title) {
                          markSeen("title", title);
                        }
                        patchShowcase({ title });
                      }}
                      isDisabled={busy}
                    />
                  )}
                </TabPanel>

                <TabPanel id="challenges" className={TAB_PANEL}>
                  <ChallengesPanel fresh={newChallenges} />
                </TabPanel>

                <TabPanel id="badges" className={TAB_PANEL}>
                  {cosmeticsPending ?? (
                    <BadgesPanel
                      badges={editorBadges}
                      reserved={reserved}
                      owned={cosmetics?.badges ?? []}
                      fresh={freshBadges}
                      onSeen={(id) => markSeen("badge", id)}
                      pinned={showcase.badges}
                      onPinnedChange={(badges) => patchShowcase({ badges })}
                      isDisabled={busy}
                    />
                  )}
                </TabPanel>
              </Tabs>
            )}

            {catalog && !isEmpty(draft) && (tab === "frame" || tab === "background" || tab === "character") ? (
              <Button variant="ghost" size="sm" className="self-start" isDisabled={busy} onPress={() => patchDraft(EMPTY)}>
                Сбросить оформление
              </Button>
            ) : null}
          </div>

          <div className="order-first grid place-items-center border border-line py-8 [background:var(--ds-hatch),var(--color-bg)] max-md:py-4 md:order-none">
            <ProfilePreview userId={userId} name={previewName} username={username} avatar={draft} showcase={showcase} />
          </div>
        </div>

        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

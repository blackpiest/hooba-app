import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  FieldGroup,
  ICON_NAMES,
  Icon,
  IconButton,
  PasswordField,
  Radio,
  Alert,
  Avatar,
  AvatarStack,
  Badge,
  ConfirmDialog,
  Dialogue,
  EmptyState,
  Meter,
  Progress,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  ToastHost,
  toast,
  ContextMenu,
  DropdownMenu,
  MenuItem,
  MenuSection,
  MenuSeparator,
  Modal,
  Popover,
  PopoverTitle,
  Counter,
  Divider,
  Kbd,
  KbdCombo,
  Logo,
  TextLink,
  LoadingDots,
  MarkLoader,
  Slime,
  RadioGroup,
  BadgeCard,
  ProfileCardFrame,
  ProfileCardWindow,
  ProfilePlate,
  RoleBadge,
  SegmentedControl,
  ComboBox,
  Select,
  Skeleton,
  Spinner,
  Swatches,
  Tag,
  InviteCodeCard,
  Tooltip,
  UnreadDot,
  Slider,
  Switch,
  TextField,
  Textarea,
} from "@/shared/ui";
import { CheckList, CheckListItem } from "@/shared/ui/check-list/CheckList";
import { KIT_BACKGROUNDS, KIT_BADGES, KIT_FRAMES, KIT_TITLES } from "./kit-cosmetics";
import { ShowcaseBadges, ShowcaseTitle } from "@/widgets/user-profile-card";
import { ShellDemo } from "./ShellDemo";
import { VoiceSettingsModal } from "@/features/voice/voice-settings/VoiceSettingsModal";
import { ProfileEditDialog } from "@/widgets/profile-edit/ProfileEditDialog";
import { useAvatarStore } from "@/stores/avatar-store";
import type { ProfileNews } from "@/shared/api/profile-news";
import { useMemberProfileStore } from "@/stores/member-profile-store";
import { useRoleStore } from "@/stores/role-store";
import { ChannelSettingsDialog } from "@/widgets/aside-channels/ChannelSettingsDialog";
import { MessageRow } from "@/pages/app/channel-view/MessageRow";
import { ChatComposer } from "@/pages/app/channel-view/ChatComposer";
import { AsideUsers } from "@/widgets/aside-users/AsideUsers";
import { UserDock as UserDockWidget } from "@/widgets/user-dock/UserDock";
import { UserProfileCardHost } from "@/widgets/user-profile-card/UserProfileCard";
import { useProfileCardStore } from "@/widgets/user-profile-card/profile-card-store";
import { usePresenceStore } from "@/stores/presence-store";
import { AsideChannels } from "@/widgets/aside-channels/AsideChannels";
import { useVoiceRoomsStore } from "@/stores/voice-rooms-store";
import { RolesPanel } from "@/widgets/staff-tools/RolesPanel";
import { StaffTools } from "@/widgets/staff-tools/StaffTools";
import { MemberActions } from "@/widgets/member-actions/MemberActions";
import { ScreenShareStartModal } from "@/features/screenshare/ScreenShareStartModal";
import { useScreenShareStore } from "@/features/screenshare/screen-share-store";

/**
 * Витрина UI-кита (только dev, маршрут /dev/kit).
 * Показывает НАСТОЯЩИЕ компоненты из @/shared/ui — по мере их появления.
 * HTML-прототип для визуальных экспериментов: temp_folder/design-system/index.html.
 * Правило готовности компонента: он добавлен сюда (docs/DESIGN_SYSTEM_MIGRATION_PLAN.md §3.4).
 */

type Swatch = { name: string; className: string };

const COLORS: { group: string; items: Swatch[] }[] = [
  {
    group: "Бренд и акцент",
    items: [
      { name: "brand", className: "bg-brand" },
      { name: "brand-hover", className: "bg-brand-hover" },
      { name: "brand-soft", className: "bg-brand-soft" },
      { name: "brand-text", className: "bg-brand-text" },
      { name: "accent", className: "bg-accent" },
    ],
  },
  {
    group: "Поверхности и линии",
    items: [
      { name: "bg", className: "bg-bg" },
      { name: "surface", className: "bg-surface" },
      { name: "elevated", className: "bg-elevated" },
      { name: "paper", className: "bg-paper" },
      { name: "line", className: "bg-line" },
      { name: "line-strong", className: "bg-line-strong" },
    ],
  },
  {
    group: "Статусы",
    items: [
      { name: "success", className: "bg-success" },
      { name: "warning", className: "bg-warning" },
      { name: "danger", className: "bg-danger" },
      { name: "info", className: "bg-info" },
    ],
  },
];

/** Разделы кита. `ready: true` — компонент реализован и показан ниже. */
const SECTIONS: { id: string; title: string; ready: boolean }[] = [
  { id: "icon", title: "Icon", ready: true },
  { id: "button", title: "Button / IconButton", ready: true },
  { id: "fields", title: "TextField / Textarea", ready: true },
  { id: "toggles", title: "Checkbox / Radio / Switch", ready: true },
  { id: "select", title: "Select / ComboBox", ready: true },
  { id: "slider", title: "Slider", ready: true },
  { id: "badges", title: "Badge / Counter / Tag / RoleBadge / Kbd", ready: true },
  { id: "avatar", title: "Avatar / AvatarStack / PresenceDot", ready: true },
  { id: "loaders", title: "Spinner / MarkLoader / LoadingDots / Skeleton", ready: true },
  { id: "modal", title: "Modal / ConfirmDialog", ready: true },
  { id: "menu", title: "Menu / ContextMenu / Popover / Tooltip", ready: true },
  { id: "feedback", title: "Alert / Toast / Progress / Meter / EmptyState", ready: true },
  { id: "tabs", title: "Tabs", ready: true },
  { id: "segmented", title: "SegmentedControl / Swatches / Divider", ready: true },
  { id: "list", title: "ListItem / Message / Composer / Topbar / UserDock / Card / Stage", ready: true },
];

function FieldsDemo() {
  const [about, setAbout] = useState("");
  return (
    <div className="mt-5 grid gap-6 border border-line bg-surface p-5 md:grid-cols-3">
      <TextField label="Имя" placeholder="Как тебя звать?" hint="До 14 символов" />
      <TextField label="Заполнено" defaultValue="Рифт" />
      <TextField label="Email" isRequired defaultValue="riftmail" error="Похоже на ошибку в адресе" />
      <TextField label="Инвайт" defaultValue="HB-4F2K-91" success="Приглашение действует" mono />
      <TextField label="Заблокировано" defaultValue="Недоступно" isDisabled hint="Нет прав на изменение" />
      <TextField label="Только чтение" defaultValue="north-star.example" isReadOnly />
      <PasswordField label="Пароль" defaultValue="supersecret" hint="Минимум 8 символов" />
      <TextField label="Поиск" placeholder="Найти канал…" leadingIcon="search" />
      <TextField label="Адрес сервера" addonStart="https://" placeholder="chat.example.com" hint="Домен или IP вашего VPS" />
      <Textarea
        label="О себе"
        value={about}
        onChange={setAbout}
        maxLength={140}
        showCount
        placeholder="Пару слов о себе…"
        className="md:col-span-2"
      />
      <Textarea label="Заблокировано" defaultValue="Текст" isDisabled rows={3} />
      <div className="md:col-span-3">
        <p className={LABEL}>Высота контролов в одной строке (md = 44px)</p>
        <div className="flex items-start gap-2">
          <TextField aria-label="Поле" className="flex-1" placeholder="Название новой роли" />
          <PasswordField aria-label="Пароль" className="w-56" defaultValue="secret" />
          <Select aria-label="Список" className="w-48" options={[{ value: "a", label: "Вариант" }]} value="a" />
          <Button>Создать</Button>
          <Button variant="secondary">Отмена</Button>
        </div>
      </div>
      <div className="md:col-span-3">
        <p className={LABEL}>FieldGroup — группа полей: заголовок крупнее подписей</p>
        <FieldGroup
          title="Когда идёт испытание"
          description="По часам сервера. Необязательно — без дат испытание бессрочное."
          aside={<Button size="sm" variant="secondary">Сбросить</Button>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Начало" placeholder="31.10.2026 20:00" />
            <TextField label="Конец" placeholder="01.11.2026 02:00" />
          </div>
        </FieldGroup>
      </div>
    </div>
  );
}

const LABEL = "mb-3 font-label text-[10px] uppercase tracking-[0.1em] text-muted";

function TogglesDemo() {
  const [members, setMembers] = useState<Record<string, boolean>>({ rift: true, kip: false, spark: true });
  const toggle = (key: string) => (value: boolean) => setMembers((m) => ({ ...m, [key]: value }));
  return (
    <div className="mt-5 space-y-8 border border-line bg-surface p-5">
      <div>
        <p className={LABEL}>Checkbox</p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <Checkbox>Не отмечен</Checkbox>
          <Checkbox defaultSelected>Отмечен</Checkbox>
          <Checkbox isIndeterminate>Частично</Checkbox>
          <Checkbox isInvalid>Ошибка</Checkbox>
          <Checkbox isDisabled>Заблокирован</Checkbox>
          <Checkbox isDisabled defaultSelected>
            Заблокирован · выбран
          </Checkbox>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Checkbox variant="card" defaultSelected description="Участники услышат звук вашего приложения">
            Передавать звук экрана
          </Checkbox>
          <Checkbox variant="card" description="Виден всем зрителям">
            Показывать курсор
          </Checkbox>
          <Checkbox variant="card" isDisabled description="Недоступно на вашей роли">
            Запись трансляции
          </Checkbox>
        </div>
      </div>

      <div>
        <p className={LABEL}>Radio</p>
        <div className="grid gap-6 md:grid-cols-2">
          <RadioGroup label="Доступ к каналу" defaultValue="all" orientation="horizontal">
            <Radio value="all">Все роли</Radio>
            <Radio value="staff">Только staff</Radio>
            <Radio value="custom">Выбранные роли</Radio>
            <Radio value="x" isDisabled>
              Недоступно
            </Radio>
          </RadioGroup>
          <RadioGroup label="Качество" defaultValue="1080" hint="Влияет на нагрузку на сеть">
            <Radio value="720" description="Меньше трафика">
              720p
            </Radio>
            <Radio value="1080">1080p</Radio>
            <Radio value="src" isDisabled>
              Исходное
            </Radio>
          </RadioGroup>
          <RadioGroup label="Закрытый вариант (нажимается, выбор не меняет)" value="open" onChange={() => {}}>
            <Radio value="open" variant="card">
              Получен
            </Radio>
            <Radio value="locked" variant="card" isLocked>
              Не получен
            </Radio>
          </RadioGroup>
          <RadioGroup label="Заблокировано · выбрано" defaultValue="a" isDisabled>
            <Radio value="a">Выбранный</Radio>
            <Radio value="b">Другой</Radio>
          </RadioGroup>
        </div>
      </div>

      <div>
        <p className={LABEL}>Switch</p>
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <Switch>Выкл</Switch>
          <Switch defaultSelected>Подавление шума</Switch>
          <Switch isDisabled>Заблокирован</Switch>
          <Switch isDisabled defaultSelected>
            Заблокирован · вкл
          </Switch>
        </div>
      </div>

      <div>
        <p className={LABEL}>CheckList (список с флажками)</p>
        <CheckList className="max-w-sm">
          <CheckListItem checked={members.rift} onChange={toggle("rift")} trailing="Owner">
            Рифт
          </CheckListItem>
          <CheckListItem checked={members.kip} onChange={toggle("kip")}>
            Кип
          </CheckListItem>
          <CheckListItem checked={members.spark} onChange={toggle("spark")} trailing="Admin">
            Искра
          </CheckListItem>
          <CheckListItem checked={false} disabled onChange={() => undefined}>
            Эхо (недоступно)
          </CheckListItem>
        </CheckList>
      </div>
    </div>
  );
}

/** В dev-витрине состояние оверлеев можно задать через ?open=modal|confirm|menu|context — удобно для скриншотов. */
const initialOpen = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("open");

/** Демо-каталог аватаров: персонажи — файлы dev-backend (через прокси Vite), без него — буквы. */
function seedDemoAvatarCatalog() {
  const file = (name: string) => `/api/v1/avatars/files/${name}.webp`;
  useAvatarStore.setState({
    catalog: {
      version: "demo",
      characters: [
        ["yo", "Йо"],
        ["moran", "Моран"],
        ["wingi", "Винги"],
        ["kiko", "Кико"],
        ["smok", "Смок"],
        ["moti", "Моти"],
        ["navigator", "Навигатор"],
        ["kai", "Кай"],
        ["bulka", "Булка"],
        ["aleks", "Алекс"],
        ["loki", "Локи"],
        ["jinny", "Джинни"],
        ["nektarinka", "Нектаринка"],
      ].map(([id, name]) => ({
        id: id!,
        name: name!,
        url: file(`char-${id}`),
        head_url: file(`head-${id}`),
        idle: { url: file(`idle-${id}`), frames: 4, fps: 6, sequence: [0, 0, 0, 1, 2, 2, 2, 1, 0, 0, 0, 1, 2, 2, 2, 1, 0, 3, 0] },
      })),
      backgrounds: KIT_BACKGROUNDS,
      frames: KIT_FRAMES,
      badges: KIT_BADGES,
      titles: KIT_TITLES,
    },
  });
}

const DEMO_CHANNELS = [
  { id: 101, name: "общий", channel_type: "TEXT", position: 0, is_private: false },
  { id: 102, name: "мемы", channel_type: "TEXT", position: 1, is_private: false },
  { id: 103, name: "staff", channel_type: "TEXT", position: 2, is_private: true },
  { id: 201, name: "Кухня", channel_type: "VOICE", position: 0, is_private: false },
  { id: 202, name: "Кооп", channel_type: "VOICE", position: 1, is_private: true },
].map((channel) => ({ ...channel, created_at: "", updated_at: "" }));

/** Сайдбар каналов на демо-данных: голосовая комната с участниками. */
function AsideDemo() {
  useEffect(() => {
    useVoiceRoomsStore.setState({
      byChannelId: {
        201: [
          { user_id: 11, username: "Рифт", muted: false, deafened: false },
          { user_id: 12, username: "Кип", muted: true, deafened: false },
          { user_id: 13, username: "Искра", muted: false, deafened: true },
        ],
      },
      screenShareByChannelId: { 201: { user_id: 13 } as never },
    });
  }, []);
  return (
    <div className="mt-5 w-64 border border-line bg-bg">
      <AsideChannels
        textChannels={DEMO_CHANNELS.filter((c) => c.channel_type === "TEXT")}
        voiceRooms={DEMO_CHANNELS.filter((c) => c.channel_type === "VOICE")}
        members={[]}
      />
    </div>
  );
}

const DEMO_MEMBERS = [
  { id: 11, username: "rift", display_name: "Рифт", avatar: null, roles: ["OWNER"], role_ids: [], status: "online", is_online: true, last_seen_at: null, game: "Dota 2" },
  { id: 12, username: "kip", display_name: null, avatar: null, roles: ["MEMBER"], role_ids: [], status: "idle", is_online: true, last_seen_at: null, game: null },
  { id: 13, username: "spark", display_name: "Искра", avatar: null, roles: ["ADMIN"], role_ids: [], status: "dnd", is_online: true, last_seen_at: null, game: null },
  { id: 14, username: "echo", display_name: null, avatar: null, roles: ["MEMBER"], role_ids: [], status: "offline", is_online: false, last_seen_at: null, game: null },
] as never[];

const PROFILE_DEMOS = [
  { name: "Рифт", username: "rift", status: "В сети", dot: "bg-presence-online", self: true },
  { name: "Ночной кролик с очень длинным ником", username: "night_rabbit_from_far_away", status: "Не беспокоить", dot: "bg-presence-dnd", self: false },
  { name: "Эхо", username: "echo", status: "Не в сети", dot: "bg-presence-offline", self: false, frame: "ice" },
];

/** Витрина первой демо-карточки: титул и закреплённые значки. */
const DEMO_SHOWCASE = { badges: KIT_BADGES, title: KIT_TITLES[0] ?? null, titleBadge: KIT_BADGES[0] ?? null };

/** Рамка мини-профиля: свой профиль (кнопка статуса, титул и значки), длинные имена, офлайн в рамке «Льдина». */
function ProfileFrameDemo() {
  return (
    <div className="mt-5 flex flex-wrap gap-6">
      {PROFILE_DEMOS.map((d) => (
        <div key={d.username} className="w-[264px] border border-brand/60 bg-bg p-2">
          <ProfileCardFrame
            skin={KIT_FRAMES.find((f) => f.id === d.frame)}
            title={<span className="block truncate">{d.name}</span>}
            subtitle={d.self ? <ShowcaseTitle showcase={DEMO_SHOWCASE} /> : null}
            overlay={d.self ? <ShowcaseBadges showcase={DEMO_SHOWCASE} /> : null}
            username={`@${d.username}`}
            status={
              d.self ? (
                <Button variant="plate" trailingIcon="chevron-down">
                  <span className={`size-2 shrink-0 ${d.dot}`} aria-hidden="true" />
                  {d.status}
                </Button>
              ) : (
                <ProfilePlate className="h-[26px] gap-[7px] px-[9px] font-label text-[9px] uppercase tracking-[0.1em] text-fg">
                  <span className={`size-2 shrink-0 ${d.dot}`} aria-hidden="true" />
                  {d.status}
                </ProfilePlate>
              )
            }
          >
            <ProfileCardWindow background={null} character={null} fallbackInitial={d.name.slice(0, 1)} />
          </ProfileCardFrame>
        </div>
      ))}
      {KIT_BADGES[1] ? (
        <div className="w-[264px] self-start border border-line bg-surface p-3">
          <BadgeCard badge={KIT_BADGES[1]} note="Получено 12.10.2026" noteIcon="check" />
        </div>
      ) : null}
    </div>
  );
}

/** Правый список участников, плашка пользователя и карточка профиля на демо-данных. */
const DEMO_PROFILE_NEWS: ProfileNews = {
  cosmetics: 1,
  cosmetic_kind: "frame",
  challenges: 1,
  challenge_ids: [1],
  completed: [{ id: 1, title: "Болтун" }],
  completed_count: 1,
};

function UsersDemo() {
  // Подсказка о новинках конструктора (AnchoredPopover) у плашки пользователя; после «Позже» вернуть — перезагрузкой.
  const [news, setNews] = useState<ProfileNews | null>(DEMO_PROFILE_NEWS);
  useEffect(() => {
    useMemberProfileStore.getState().setFromDirectory([
      { id: 11, username: "rift", display_name: "Рифт", roles: ["OWNER"], role_ids: [] },
      { id: 12, username: "kip", display_name: null, roles: ["MEMBER"], role_ids: [2, 3] },
    ]);
    usePresenceStore.setState({ statusByUserId: { 11: "online", 12: "idle", 13: "dnd", 14: "offline" }, gameByUserId: { 11: "Dota 2" } });
    // Карточка закрывается по resize окна (в том числе при снятии скриншота) — переоткрываем её после каждого resize.
    const open = () =>
      useProfileCardStore.setState({
        target: { userId: 12, fallbackName: "kip", anchor: { top: 120, left: 800, right: 1000, bottom: 150 }, side: "left" },
      });
    const onResize = () => window.setTimeout(open, 50);
    const timer = window.setTimeout(open, 400);
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return (
    <div className="mt-5 flex gap-6">
      <div className="w-64 border border-line bg-bg">
        <AsideUsers
          onlineGroups={[
            { key: "role:demo", label: "Легенды", members: DEMO_MEMBERS.slice(0, 1) },
            { key: "online", label: "Онлайн", members: DEMO_MEMBERS.slice(1, 3) },
          ]}
          offlineMembers={DEMO_MEMBERS.slice(3)}
          viewerId={11}
          onOpenMember={() => undefined}
        />
      </div>
      <div className="w-64 self-end border border-line bg-bg">
        <UserDockWidget
          userId={11}
          username="rift"
          preference="online"
          badge="online"
          statusLabel="В сети"
          news={news}
          onEditProfile={() => undefined}
          onOpenNews={() => setNews(null)}
          onDismissNews={() => setNews(null)}
          onPresence={() => undefined}
          onSettings={() => undefined}
        />
      </div>
      <UserProfileCardHost
        meId={11}
        roleTools={{
          busy: false,
          onToggle: async (userId, roleId, on) => {
            const current = useMemberProfileStore.getState().profileByUserId[userId];
            const ids = new Set(current?.role_ids ?? []);
            if (on) {
              ids.add(roleId);
            } else {
              ids.delete(roleId);
            }
            useMemberProfileStore.getState().setRoles(userId, current?.roles ?? [], [...ids]);
            return true;
          },
        }}
        onEditProfile={() => undefined} onPresence={() => undefined} />
    </div>
  );
}

const iso = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const DEMO_ROWS = [
  { id: 1, channel_id: 1, author_id: 11, author_username: "Рифт", content: "Я в голосовом. Залетайте, @Кип.", attachments: [], is_deleted: false, created_at: iso(70), updated_at: iso(70) },
  { id: 2, channel_id: 1, author_id: 11, author_username: "Рифт", content: "Продолжение того же автора идёт без аватара.", attachments: [], is_deleted: false, created_at: iso(69), updated_at: iso(60) },
  { id: 3, channel_id: 1, author_id: 13, author_username: "Искра", content: "Сейчас включу экран. Это надо видеть.", attachments: [], reactions: [{ emoji: "🔥", custom_emoji_id: null, count: 3, user_ids: [11, 12, 13] }, { emoji: "👀", custom_emoji_id: null, count: 1, user_ids: [12] }], is_deleted: false, created_at: iso(40), updated_at: iso(40) },
  { tempId: "t1", channel_id: 1, author_id: 12, author_username: "Кип", content: "Сообщение, которое не ушло", attachments: [], is_deleted: false, created_at: iso(1), updated_at: iso(1), failed: true },
] as never[];

/** Лента чата и композер на демо-данных. */
function ChatDemo() {
  const noop = () => undefined;
  return (
    <div className="mt-5 flex h-[560px] w-[760px] flex-col border border-line bg-[#13131f]">
      <div className="min-h-0 flex-1 overflow-auto py-3">
        {DEMO_ROWS.map((row, index) => (
          <MessageRow
            key={index}
            row={row}
            grouped={index === 1}
            newDay={index === 0}
            own={(row as { author_id: number }).author_id === 11}
            editing={false}
            editDraft=""
            onEditDraftChange={noop}
            onCancelEdit={noop}
            onStartEdit={noop}
            onExternalLink={noop}
            onRetry={noop}
            onDiscard={noop}
            moderator="owner"
            onRequestDelete={noop}
            pinned={index === 0}
            onTogglePin={noop}
            viewerId={11}
            canReact
            onToggleReaction={noop}
          />
        ))}
      </div>
      <ChatComposer channelId={1} channelName="общий" canAttach attachApiRef={{ current: null }} onAttachError={noop} onSend={noop} />
    </div>
  );
}

function OverlaysDemo() {
  const [modal, setModal] = useState(initialOpen === "modal");
  const [confirm, setConfirm] = useState(initialOpen === "confirm");
  const [settings, setSettings] = useState(initialOpen === "settings");
  const [profile, setProfile] = useState(initialOpen === "profile");
  const [channelDialog, setChannelDialog] = useState(initialOpen === "channel");
  const [member, setMember] = useState(initialOpen === "member");
  const [staff, setStaff] = useState(initialOpen === "staff");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (initialOpen === "profile") {
      seedDemoAvatarCatalog();
    }
    if (initialOpen === "share") {
      useScreenShareStore.getState().openStart();
    }
    useRoleStore.setState({
      roles: [
        { id: 1, key: "ADMIN", name: "Админ", color: "#7C69F7", position: 0, is_system: true },
        { id: 2, key: "MEMBER", name: "Нормис", color: "#A5A3B5", position: 1, is_system: true },
        { id: 3, key: null, name: "Стример", color: "#7CC9E6", position: 2, is_system: false },
        { id: 4, key: null, name: "Модератор", color: "#38C987", position: 3, is_system: false },
      ],
    });
  }, []);
  const [context, setContext] = useState<{ x: number; y: number } | null>(
    initialOpen === "context" ? { x: 420, y: 260 } : null,
  );
  const [status, setStatus] = useState("online");
  const [last, setLast] = useState("—");

  return (
    // backdrop-blur нарочно: как у glass-панелей приложения — защита от регресса «меню уезжает от курсора».
    <div className="mt-5 space-y-6 border border-line bg-surface p-5 backdrop-blur-[1px]">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" onPress={() => setModal(true)}>
          Modal
        </Button>
        <Button variant="secondary" onPress={() => setConfirm(true)}>
          ConfirmDialog
        </Button>

        <Button variant="secondary" onPress={() => setSettings(true)}>
          Окно настроек
        </Button>
        <Button
          variant="secondary"
          onPress={() => {
            seedDemoAvatarCatalog();
            setProfile(true);
          }}
        >
          Профиль
        </Button>
        <Button variant="secondary" onPress={() => setChannelDialog(true)}>
          Новый канал
        </Button>
        <Button variant="secondary" onPress={() => setMember(true)}>
          Участник
        </Button>
        <Button variant="secondary" onPress={() => setStaff(true)}>
          Управление сервером
        </Button>
        <Button variant="secondary" onPress={() => useScreenShareStore.getState().openStart()}>
          Трансляция
        </Button>

        <Popover trigger={<Button variant="secondary">Popover</Button>} aria-label="Режим рации">
          <PopoverTitle>Режим рации</PopoverTitle>
          Микрофон включается, пока вы удерживаете клавишу. Доступно только в приложении для Windows.
        </Popover>

        <DropdownMenu
          trigger={
            <Button variant="secondary" trailingIcon="chevron-down">
              Меню
            </Button>
          }
          aria-label="Участник"
          onAction={(key) => setLast(String(key))}
        >
          <MenuSection label="Участник · Кип">
            <MenuItem id="profile" icon="user">
              Профиль
            </MenuItem>
            <MenuItem id="mute" icon="mic-off">
              Заглушить
            </MenuItem>
            <MenuItem id="role" icon="shield" shortcut="R">
              Выдать роль
            </MenuItem>
          </MenuSection>
          <MenuSeparator />
          <MenuItem id="kick" icon="logout" danger>
            Выгнать
          </MenuItem>
          <MenuItem id="locked" icon="lock" isDisabled>
            Недоступно
          </MenuItem>
        </DropdownMenu>

        <DropdownMenu
          trigger={
            <Button variant="secondary" trailingIcon="chevron-down">
              Статус: {status}
            </Button>
          }
          aria-label="Статус"
          selectionMode="single"
          selectedKeys={[status]}
          onSelectionChange={(keys) => setStatus(String([...keys][0] ?? status))}
        >
          <MenuItem id="online">На связи</MenuItem>
          <MenuItem id="idle">Отошёл</MenuItem>
          <MenuItem id="dnd">Не беспокоить</MenuItem>
        </DropdownMenu>

        <span className="text-xs text-muted">Последнее действие: {last}</span>
      </div>

      <div
        className="grid h-24 place-items-center border border-dashed border-line-strong text-xs text-muted"
        onContextMenu={(event) => {
          event.preventDefault();
          setContext({ x: event.clientX, y: event.clientY });
        }}
      >
        Правый клик здесь — ContextMenu
      </div>

      {context ? (
        <ContextMenu x={context.x} y={context.y} onClose={() => setContext(null)} aria-label="Сообщение" onAction={(key) => setLast(String(key))}>
          <MenuItem id="copy" icon="copy">
            Копировать
          </MenuItem>
          <MenuItem id="edit" icon="edit">
            Редактировать
          </MenuItem>
          <MenuSeparator />
          <MenuItem id="delete" icon="trash" danger>
            Удалить
          </MenuItem>
        </ContextMenu>
      ) : null}

      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title="Свой сервер"
        icon="shield"
        footer={
          <>
            <Button variant="ghost" onPress={() => setModal(false)}>
              Позже
            </Button>
            <Button trailingIcon="arrow-right" onPress={() => setModal(false)}>
              Понятно
            </Button>
          </>
        }
      >
        <p className="mb-3">Hooba работает на вашем сервере — одна установка, одно сообщество.</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Арендуйте <b className="text-fg">VPS</b>
          </li>
          <li>
            Запустите <b className="text-fg">install.sh</b>
          </li>
          <li>
            Отправьте друзьям <b className="text-fg">приглашение</b>
          </li>
        </ol>
      </Modal>

      {staff ? (
        <StaffTools
          busy={false}
          freshCode={null}
          message={null}
          viewerIsOwner
          viewerId={1}
          members={[]}
          onClose={() => setStaff(false)}
          onRevokeAdmin={async () => true}
          onBanMember={async () => true}
          onCreateInvite={async () => undefined}
          onRevokeInvite={async () => undefined}
        />
      ) : null}

      {initialOpen === "roles" ? (
        <div className="fixed inset-0 z-[70] overflow-auto bg-bg p-6">
          <div className="mx-auto max-w-xl">
            <RolesPanel members={[]} defaultOpenId={3} />
          </div>
        </div>
      ) : null}

      {member ? (
        <MemberActions
          point={{ x: 640, y: 320 }}
          member={{ id: 2, username: "kip", roles: ["MEMBER"], status: "online", is_online: true, last_seen_at: null, game: null, role_ids: [3], display_name: null, avatar: null }}
          viewerIsOwner
          canModerate
          reported={false}
          busy={false}
          message="Участник уже получил предупреждение сегодня"
          onClose={() => setMember(false)}
          onToggleAdmin={async () => true}
          onToggleRole={async () => true}
          onKick={async () => true}
          onBan={async () => true}
          onToggleNameLock={async () => true}
          onReport={async () => true}
        />
      ) : null}

      <ScreenShareStartModal />

      {channelDialog ? (
        <ChannelSettingsDialog
          channelType="TEXT"
          members={[]}
          meId={1}
          meUsername="rift"
          onClose={() => setChannelDialog(false)}
          onSaved={() => setChannelDialog(false)}
        />
      ) : null}

      {profile ? (
        <ProfileEditDialog
          userId={1}
          username="rift"
          displayName="Рифт"
          avatar={{ character: "yo", background: "stars", frame: "blue" }}
          onClose={() => setProfile(false)}
        />
      ) : null}

      <VoiceSettingsModal
        isOpen={settings}
        onOpenChange={setSettings}
        voiceInputId=""
        voiceOutputId=""
        audioInputDevices={[]}
        audioOutputDevices={[]}
        voiceMediaDbg={null}
        inputVolume={100}
        outputVolume={80}
        captureMode="suppress"
        activationMode="vad"
        onInputChange={() => undefined}
        onOutputChange={() => undefined}
        onInputVolume={() => undefined}
        onOutputVolume={() => undefined}
        onCaptureModeChange={() => undefined}
        onActivationModeChange={() => undefined}
        onRefreshDevices={() => undefined}
        onCopyIncidentReport={async () => undefined}
        onLogout={() => setSettings(false)}
      />

      <ConfirmDialog
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        title="Выгнать Кипа?"
        description="Участник потеряет доступ к серверу. Вернуться он сможет только по новому приглашению."
        confirmLabel="Выгнать"
        isPending={pending}
        onConfirm={() => {
          setPending(true);
          window.setTimeout(() => {
            setPending(false);
            setConfirm(false);
          }, 1200);
        }}
      />
    </div>
  );
}

function FeedbackDemo() {
  const [alertOpen, setAlertOpen] = useState(true);
  const [level, setLevel] = useState(55);
  useEffect(() => {
    const timer = window.setInterval(() => setLevel(Math.round(25 + Math.random() * 70)), 220);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="mt-5 space-y-8 border border-line bg-surface p-5">
      <div>
        <p className={LABEL}>Alert</p>
        <div className="grid gap-3 md:grid-cols-2">
          {alertOpen ? (
            <Alert
              tone="info"
              title="Обновление загружено"
              onClose={() => setAlertOpen(false)}
              actions={
                <>
                  <Button variant="link">Перезапустить</Button>
                  <Button variant="link" className="text-muted">
                    Позже
                  </Button>
                </>
              }
            >
              Версия 0.9.4 установится при следующем запуске.
            </Alert>
          ) : (
            <Button variant="secondary" size="sm" onPress={() => setAlertOpen(true)}>
              Показать снова
            </Button>
          )}
          <Alert tone="success" title="Профиль сохранён">
            Изменения видны всем участникам.
          </Alert>
          <Alert tone="warning" title="Нестабильное соединение">
            Качество голоса может снижаться.
          </Alert>
          <Alert tone="danger" title="Не удалось отправить">
            Сервер недоступен. Мы повторим попытку автоматически.
          </Alert>
          <Alert tone="warning" compact className="md:col-span-2">
            Вы ограничены в этом канале — писать могут только модераторы.
          </Alert>
        </div>
      </div>

      <div>
        <p className={LABEL}>Dialogue</p>
        <Dialogue
          lines={[
            "Собирайте друзей в Hooba: играйте, разговаривайте и делитесь тем, что происходит на экране.",
            "Здесь есть чаты, голосовые комнаты и свой сервер.",
          ]}
        />
      </div>

      <div>
        <p className={LABEL}>Toast</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onPress={() => toast.info("Подключено к серверу", "Голосовая комната готова.")}>
            info
          </Button>
          <Button variant="secondary" size="sm" onPress={() => toast.success("Ссылка скопирована")}>
            success
          </Button>
          <Button variant="secondary" size="sm" onPress={() => toast.warning("Нестабильное соединение", "Качество голоса может снижаться.")}>
            warning
          </Button>
          <Button variant="secondary" size="sm" onPress={() => toast.error("Не удалось отправить", "Сервер недоступен.")}>
            error
          </Button>
          <Button variant="secondary" size="sm" onPress={() => toast.info({ title: "Не закрывается сам", duration: 0 })}>
            sticky
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onPress={() =>
              toast.success({
                title: "Испытание «Мирный житель» выполнено",
                description: "Награда: титул «Мирный житель»",
                action: { label: "Посмотреть награду", onPress: () => toast.info("Действие тоста") },
              })
            }
          >
            action
          </Button>
          <span className="text-xs text-muted">Появляются справа внизу; при наведении таймер ставится на паузу.</span>
        </div>
      </div>

      <div>
        <p className={LABEL}>Progress · Meter</p>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <Progress value={62} label="Загрузка картинки" showValue />
            <Progress value={100} tone="success" aria-label="Готово" />
            <Progress value={30} tone="danger" aria-label="Ошибка" />
            <Progress isIndeterminate label="Подключение" />
          </div>
          <div>
            <Meter value={level} aria-label="Уровень микрофона" />
            <p className="mt-2 text-xs text-muted">Зелёный → жёлтый → красный. Проверка звука в настройках голоса.</p>
          </div>
        </div>
      </div>

      <div>
        <p className={LABEL}>Tabs</p>
        <Tabs defaultSelectedKey="profile">
          <TabList aria-label="Настройки">
            <Tab id="profile">Профиль</Tab>
            <Tab id="look">Внешний вид</Tab>
            <Tab id="privacy">
              Приватность <Counter value={2} />
            </Tab>
            <Tab id="soon" isDisabled>
              Скоро
            </Tab>
          </TabList>
          <TabPanel id="profile">Панель «Профиль». Переключайте вкладки кликом или стрелками.</TabPanel>
          <TabPanel id="look">Панель «Внешний вид».</TabPanel>
          <TabPanel id="privacy">Панель «Приватность».</TabPanel>
        </Tabs>
      </div>

      <div>
        <p className={LABEL}>EmptyState</p>
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            variant="dashed"
            title="Тут пока тихо"
            description="Напишите первое сообщение — и канал оживёт."
            action={<Button size="sm">Написать</Button>}
          />
          <EmptyState icon="search" title="Ничего не нашли" description="Попробуйте другой запрос или проверьте написание." />
        </div>
      </div>

      <ToastHost />
    </div>
  );
}

const ROLE_COLORS = [
  { value: "#7C69F7", label: "Фиолетовый" },
  { value: "#38C987", label: "Мята" },
  { value: "#F06478", label: "Коралл" },
  { value: "#F2B84B", label: "Янтарь" },
  { value: "#7CC9E6", label: "Лёд" },
];

function DisplayDemo() {
  const [quality, setQuality] = useState("1080");
  const [color, setColor] = useState("#7C69F7");
  const [tags, setTags] = useState(["Игры", "Кино", "Музыка"]);
  return (
    <div className="mt-5 space-y-8 border border-line bg-surface p-5">
      <div>
        <p className={LABEL}>Badge · Counter · Tag · RoleBadge · Kbd</p>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Neutral</Badge>
          <Badge variant="brand">Brand</Badge>
          <Badge variant="success" dot>
            Онлайн
          </Badge>
          <Badge variant="warning">Модерация</Badge>
          <Badge variant="danger">Бан</Badge>
          <Badge variant="live">LIVE</Badge>
          <Counter value={3} />
          <Counter value={12} />
          <Counter value={120} muted />
          <UnreadDot />
          <UnreadDot label="Новое" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {tags.map((tag) => (
            <Tag key={tag} onRemove={() => setTags((t) => t.filter((x) => x !== tag))}>
              {tag}
            </Tag>
          ))}
          <Tag>Без крестика</Tag>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <RoleBadge color="#F2B84B">Owner</RoleBadge>
          <RoleBadge color="#F06478">Admin</RoleBadge>
          <RoleBadge color="#A5A3B5">Нормис</RoleBadge>
          <RoleBadge color="#F2B84B" chip>
            Owner
          </RoleBadge>
          <RoleBadge color="#7CC9E6" chip>
            Стример
          </RoleBadge>
          <KbdCombo keys={["Ctrl", "Shift", "M"]} />
          <Kbd recording>Нажмите клавишу…</Kbd>
        </div>
      </div>

      <div>
        <p className={LABEL}>InviteCodeCard</p>
        <div className="flex max-w-md flex-col gap-2">
          <InviteCodeCard code="Zx3k9QpL2mVb7TnA4wYc1RhE" link="https://hooba.example/register?invite=Zx3k9QpL2mVb7TnA4wYc1RhE" note="Одноразовый: сработает на одну регистрацию." />
          <InviteCodeCard code="Pq8rT2vN5kLm0XaZ6bYd3WcH" link={null} highlighted tag={<Tag>личный</Tag>} note="создал owner" />
          <InviteCodeCard code="Mn4bV7cX1zQw9ErT2yUi5OpA" link={null} status="used" note="Использован Алисой" />
          <InviteCodeCard code="Lk6jH3gF8dSa1PoI9uYt4RewQ" link={null} status="revoked" />
        </div>
      </div>

      <div>
        <p className={LABEL}>Logo · TextLink</p>
        <div className="flex flex-wrap items-center gap-8">
          <Logo size="sm" />
          <Logo />
          <Logo size="lg" />
          <span className="text-sm text-muted">
            Нет аккаунта? <TextLink href="#display-demo">Регистрация по инвайту</TextLink>
          </span>
        </div>
      </div>

      <div>
        <p className={LABEL}>Avatar (без картинки — заглушка с буквой)</p>
        <div className="flex flex-wrap items-end gap-6">
          <Avatar name="Рифт" size="sm" />
          <Avatar name="Кип" size="md" status="online" />
          <Avatar name="Искра" size="lg" status="idle" />
          <Avatar name="Эхо" size="xl" status="dnd" />
          <Avatar name="Ноль" size="xl" status="offline" />
          <Avatar name="Говорит" size="xl" speaking status="online" />
          <Avatar name="Профиль" size="profile" status="online" tone="#2a4a3d" />
          <AvatarStack items={[{ name: "Рифт" }, { name: "Кип" }, { name: "Искра" }, { name: "Эхо" }, { name: "Ноль" }]} />
        </div>
      </div>

      <div>
        <p className={LABEL}>SegmentedControl · Swatches · Tooltip</p>
        <div className="flex flex-wrap items-center gap-8">
          <SegmentedControl
            aria-label="Качество"
            value={quality}
            onChange={setQuality}
            options={[
              { value: "720", label: "720p" },
              { value: "1080", label: "1080p" },
              { value: "src", label: "Исходное" },
            ]}
          />
          <SegmentedControl
            aria-label="Вид"
            value="a"
            onChange={() => undefined}
            options={[
              { value: "a", label: "Список", icon: "menu" },
              { value: "b", label: "Сетка", icon: "image" },
              { value: "c", label: "Недоступно", isDisabled: true },
            ]}
          />
          <Swatches label="Цвет роли" swatches={ROLE_COLORS} value={color} onChange={setColor} />
          <Tooltip content="Выключить микрофон">
            <IconButton icon="mic" label="Микрофон" variant="solid" />
          </Tooltip>
          <Tooltip content="Снизу" placement="bottom">
            <IconButton icon="settings" label="Настройки" variant="solid" />
          </Tooltip>
          <Tooltip content="Нет права говорить в этом канале" plain>
            <span className="inline-flex">
              <IconButton icon="mic-off" label="Микрофон недоступен" variant="solid" isDisabled />
            </span>
          </Tooltip>
          <Tooltip content="очень-длинное-имя-файла-которое-не-влезает.png" plain>
            <p className="w-24 truncate text-xs text-muted">очень-длинное-имя-файла-которое-не-влезает.png</p>
          </Tooltip>
        </div>
      </div>

      <div>
        <p className={LABEL}>Divider</p>
        <div className="space-y-4">
          <Divider />
          <Divider label="Сегодня" />
          <Divider label="Новые сообщения" tone="new" />
          <div className="flex h-6 items-center gap-4 text-xs text-muted">
            Слева <Divider orientation="vertical" /> Справа
          </div>
        </div>
      </div>

      <div>
        <p className={LABEL}>Spinner · MarkLoader · LoadingDots · Skeleton</p>
        <div className="flex flex-wrap items-end gap-10">
          <Spinner size="sm" />
          <Spinner />
          <Spinner size="lg" />
          <Spinner size="xl" />
          <MarkLoader />
          <MarkLoader size="lg" />
          <Slime pose="empty" className="w-28" />
          <Slime pose="offline" className="w-28" />
          <LoadingDots />
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="flex gap-3">
            <Skeleton className="size-10 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-2.5 w-1/3" />
              <Skeleton className="h-2.5 w-11/12" />
              <Skeleton className="h-2.5 w-3/5" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-[34px]" />
            <Skeleton className="h-[34px]" />
            <Skeleton className="h-[34px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

const MICROPHONES = [
  { value: "default", label: "Микрофон по умолчанию" },
  { value: "razer", label: "Razer Seiren Mini", description: "USB" },
  { value: "headset", label: "Headset (Realtek)" },
  { value: "virtual", label: "Virtual Cable", isDisabled: true },
];

function SelectSliderDemo() {
  const [mic, setMic] = useState<string>("default");
  const [volume, setVolume] = useState(100);
  const [threshold, setThreshold] = useState(35);
  return (
    <div className="mt-5 grid gap-6 border border-line bg-surface p-5 md:grid-cols-2">
      <Select label="Микрофон" options={MICROPHONES} value={mic} onChange={setMic} hint="Выбор запоминается на этом устройстве" />
      <Select label="Динамики" options={MICROPHONES} value={null} placeholder="Не выбрано" />
      <Select label="Ошибка" options={MICROPHONES} value={null} error="Нужно выбрать устройство" isRequired />
      <Select label="Заблокировано" options={MICROPHONES} value="razer" isDisabled />

      <ComboBox label="Поиск по списку" placeholder="Начните вводить" hint="Свой текст не принимается" options={MICROPHONES.map((item) => ({ value: item.value, label: String(item.label) }))} onSelect={setMic} />

      <Slider label="Громкость участника (двойной клик — 100%)" value={volume} onChange={setVolume} resetValue={100} minValue={0} maxValue={200} formatValue={(v) => `${v}%`} />
      <Slider label="Порог микрофона" value={threshold} onChange={setThreshold} minValue={0} maxValue={100} formatValue={(v) => `−${100 - v} dB`} />
      <Slider label="Заблокирован" defaultValue={60} isDisabled formatValue={(v) => `${v}%`} />
    </div>
  );
}

export function KitPage() {
  const ready = useMemo(() => SECTIONS.filter((s) => s.ready).length, []);

  return (
    <div className="min-h-screen bg-bg font-ui text-fg">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className="font-label text-[10px] uppercase tracking-[0.1em] text-muted">Hooba · UI-кит · dev</p>
        <h1 className="mt-3 font-heading text-4xl leading-tight tracking-tight">
          Свой вайб<span className="text-accent">.</span>
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted">
          Здесь живут настоящие компоненты кита. Новый экран собирается только из них; если нужного нет — сначала
          добавьте его в <code className="font-label">shared/ui</code> и сюда.
        </p>

        <section className="mt-12">
          <h2 className="font-heading text-xl">Токены</h2>
          <div className="mt-5 space-y-6">
            {COLORS.map((group) => (
              <div key={group.group}>
                <p className="mb-2 font-label text-[10px] uppercase tracking-[0.1em] text-muted">{group.group}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                  {group.items.map((item) => (
                    <div key={item.name} className="border border-line">
                      <div className={`h-14 ${item.className}`} />
                      <p className="bg-bg px-2 py-1.5 font-label text-[10px] text-muted">{item.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="bg-surface p-4">
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-muted">font-heading</p>
              <p className="mt-2 font-heading text-lg">Рифт · Кухня</p>
            </div>
            <div className="bg-surface p-4">
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-muted">font-ui</p>
              <p className="mt-2 text-sm">Я в голосовом. Залетайте.</p>
            </div>
            <div className="bg-surface p-4">
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-muted">font-label</p>
              <p className="mt-2 font-label text-xs uppercase tracking-[0.1em]">На связи · Слушатель</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="bg-surface p-4 text-xs shadow-key">shadow-key</div>
            <div className="bg-surface p-4 text-xs shadow-card">shadow-card</div>
            <div className="bg-surface p-4 text-xs shadow-soft">shadow-soft</div>
          </div>
        </section>

        <section className="mt-14" id="icon-demo">
          <h2 className="font-heading text-xl">Icon</h2>
          <p className="mt-2 text-sm text-muted">
            {ICON_NAMES.length} иконок. <code className="font-label">{'<Icon name="plus" size="md" />'}</code>, цвет — через
            text-*.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-px border border-line bg-line sm:grid-cols-5 md:grid-cols-8">
            {ICON_NAMES.map((name) => (
              <div key={name} className="flex flex-col items-center gap-2 bg-surface px-1 py-4 hover:bg-elevated">
                <Icon name={name} />
                <span className="break-all text-center font-label text-[9px] text-muted">{name}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14" id="button-demo">
          <h2 className="font-heading text-xl">Button</h2>
          <p className="mt-2 text-sm text-muted">
            Primary и danger — плоские; special — пиксельная «клавиша» с фаской (hover — светлее, нажатие — утоплена). Обработчик —{" "}
            <code className="font-label">onPress</code>.
          </p>
          <div className="mt-5 space-y-6 border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-5">
              <Button>Войти</Button>
              <Button variant="special">Особая</Button>
              <Button variant="secondary">Отмена</Button>
              <Button variant="ghost">Пропустить</Button>
              <Button variant="danger">Удалить</Button>
              <Button variant="danger-ghost">Покинуть</Button>
              <Button variant="link">Забыли пароль?</Button>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <Button leadingIcon="screen" trailingIcon="arrow-right">
                Начать трансляцию
              </Button>
              <Button variant="secondary" trailingIcon="arrow-right">
                Как создать сервер
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <Button size="sm">Small 34</Button>
              <Button>Medium 44</Button>
              <Button size="lg">Large 54</Button>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <Button isPending>Сохранить</Button>
              <Button variant="danger" isPending>
                Удалить
              </Button>
              <Button isDisabled>Сохранить</Button>
              <Button variant="secondary" isDisabled>
                Отмена
              </Button>
            </div>
            <Button fullWidth>Присоединиться к серверу</Button>
          </div>

          <h3 className="mt-8 font-heading text-base">IconButton</h3>
          <div className="mt-4 flex flex-wrap items-center gap-5 border border-line bg-surface p-5">
            <IconButton icon="close" label="Закрыть" size="sm" />
            <IconButton icon="settings" label="Настройки" />
            <IconButton icon="mic" label="Микрофон" size="lg" />
            <IconButton icon="copy" label="Копировать" variant="solid" />
            <IconButton icon="headphones" label="Звук" pressed />
            <IconButton icon="mic-off" label="Микрофон выключен" variant="danger" pressed />
            <IconButton icon="trash" label="Удалить" variant="danger" />
            <IconButton icon="screen-off" label="Прекратить просмотр" variant="danger-solid" />
            <IconButton icon="edit" label="Недоступно" isDisabled />
          </div>
        </section>

        <section className="mt-14" id="fields-demo">
          <h2 className="font-heading text-xl">TextField / PasswordField / Textarea</h2>
          <p className="mt-2 text-sm text-muted">
            Валидация нативная: <code className="font-label">isRequired</code>, <code className="font-label">minLength</code>,{" "}
            <code className="font-label">validate</code> — сообщение появится под полем при отправке формы.
          </p>
          <FieldsDemo />
        </section>

        <section className="mt-14" id="toggles-demo">
          <h2 className="font-heading text-xl">Checkbox / Radio / Switch</h2>
          <p className="mt-2 text-sm text-muted">
            Radio — «срезанный октагон»: отличается от квадратного флажка, не нарушая запрет на скругления.
          </p>
          <TogglesDemo />
        </section>

        <section className="mt-14" id="select-demo">
          <h2 className="font-heading text-xl">Select / Slider</h2>
          <SelectSliderDemo />
        </section>

        <section className="mt-14" id="shell-demo">
          <h2 className="font-heading text-xl">Сборка экрана</h2>
          <p className="mt-2 text-sm text-muted">
            ListItem · Message · Composer · Toolbar · Topbar · UserDock · Section · Card · Stage — всё из <code className="font-label">@/shared/ui</code>.
            Наведите на сообщение, чтобы увидеть панель действий; у «мемы» при наведении появляется кнопка настроек.
          </p>
          <ShellDemo />
        </section>

        {initialOpen === "chat" ? (
          <div className="fixed inset-0 z-[70] overflow-auto bg-surface p-6">
            <h2 className="font-heading text-xl">Чат</h2>
            <ChatDemo />
          </div>
        ) : null}

        {initialOpen === "users" ? (
          <div className="fixed inset-0 z-[70] overflow-auto bg-surface p-6">
            <h2 className="font-heading text-xl">Участники · плашка · карточка</h2>
            <UsersDemo />
            <ProfileFrameDemo />
          </div>
        ) : null}

        {initialOpen === "aside" ? (
          <div className="fixed inset-0 z-[70] overflow-auto bg-surface p-6">
            <h2 className="font-heading text-xl">AsideChannels</h2>
            <AsideDemo />
          </div>
        ) : null}

        <section className="mt-14" id="feedback-demo">
          <h2 className="font-heading text-xl">Alert / Toast / Progress / Tabs / EmptyState</h2>
          <FeedbackDemo />
        </section>

        <section className="mt-14" id="overlays-demo">
          <h2 className="font-heading text-xl">Modal / ConfirmDialog / Popover / Menu</h2>
          <p className="mt-2 text-sm text-muted">
            Состояние держит экран: <code className="font-label">isOpen</code> + <code className="font-label">onClose</code>. Подтверждение
            выполняется 1,2 с, чтобы показать <code className="font-label">isPending</code>.
          </p>
          <OverlaysDemo />
        </section>

        <section className="mt-14" id="display-demo">
          <h2 className="font-heading text-xl">Данные, индикаторы, подсказки</h2>
          <DisplayDemo />
        </section>

        <section className="mt-14">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-xl">Компоненты</h2>
            <span className="font-label text-[10px] uppercase tracking-[0.1em] text-muted">
              {ready} / {SECTIONS.length}
            </span>
          </div>
          <ul className="mt-5 divide-y divide-line border border-line">
            {SECTIONS.map((s) => (
              <li key={s.id} id={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{s.title}</span>
                <span
                  className={
                    s.ready
                      ? "font-label text-[10px] uppercase tracking-[0.1em] text-success"
                      : "font-label text-[10px] uppercase tracking-[0.1em] text-muted"
                  }
                >
                  {s.ready ? "готов" : "в плане"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

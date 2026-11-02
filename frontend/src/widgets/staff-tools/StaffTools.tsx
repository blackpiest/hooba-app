import { useEffect, useRef, useState } from "react";
import { Heading } from "react-aria-components";
import { fetchStaffInvites, type StaffInviteRow } from "@/shared/api/invites";
import { patchServerSettings } from "@/shared/api/server-settings";
import { fetchModerationLogs, type ModerationLogRow } from "@/shared/api/moderation";
import { formatApiError } from "@/shared/api/format-error";
import { buildInviteLink } from "@/shared/lib/server-target";
import type { UserDirectoryEntry } from "@/shared/api/users";
import {
  Alert,
  Button,
  Counter,
  EmptyState,
  FieldGroup,
  IconButton,
  InviteCodeCard,
  ListItem,
  Modal,
  SettingRow,
  Spinner,
  Switch,
  toast,
} from "@/shared/ui";
import type { IconName } from "@/shared/ui";
import { useReportStore } from "@/stores/report-store";
import { useUserStore } from "@/stores/user-store";
import { useProfileCardStore } from "@/widgets/user-profile-card/profile-card-store";
import { ReportsPanel } from "./ReportsPanel";
import { RolesPanel } from "./RolesPanel";
import { useAvatarStore } from "@/stores/avatar-store";
import { WordFilterPanel } from "./WordFilterPanel";
import { EmojisPanel } from "./EmojisPanel";
import { ServerPanel } from "./ServerPanel";
import { ChallengesAdminPanel } from "./challenges/ChallengesAdminPanel";
import { AnnouncementsPanel } from "./announcements/AnnouncementsPanel";
import { CosmeticTextsPanel } from "./cosmetics/CosmeticTextsPanel";

const ACTION_LABEL: Record<string, string> = {
  WARN: "Предупреждение",
  KICK: "Исключение",
  BAN: "Блокировка",
  ROLE_CHANGE: "Смена роли",
  CHANNEL_DELETE: "Удаление канала",
  INVITE_CREATE: "Создание инвайта",
  INVITE_DELETE: "Удаление инвайта",
  INVITE_USED: "Регистрация",
  MESSAGE_DELETE: "Удаление сообщения",
  USER_INVITES_ENABLE: "Личные приглашения включены",
  USER_INVITES_DISABLE: "Личные приглашения выключены",
  COSMETIC_GRANT: "Выдача значка/титула",
  COSMETIC_REVOKE: "Отзыв значка/титула",
  CHALLENGE_PUBLISH: "Испытание опубликовано",
  CHALLENGE_ARCHIVE: "Испытание в архиве",
  DISPLAY_NAME_HIDE: "Скрытие имени",
  DISPLAY_NAME_UNHIDE: "Снятие запрета на имя",
  COSMETIC_EDIT: "Правка текста значка/титула",
  ANNOUNCEMENT_CREATE: "Объявление запланировано",
  ANNOUNCEMENT_DELETE: "Объявление удалено",
  EMOJI_CREATE: "Своя реакция добавлена",
  EMOJI_DELETE: "Своя реакция удалена",
  SERVER_ICON_UPDATE: "Аватар сервера обновлён",
  SERVER_ICON_REMOVE: "Аватар сервера убран",
};

type StaffSection =
  | "server"
  | "invites"
  | "reports"
  | "roles"
  | "challenges"
  | "announcements"
  | "showcase"
  | "emojis"
  | "filter"
  | "journal";

const SECTION_TITLE: Record<StaffSection, string> = {
  server: "Сервер",
  invites: "Инвайты",
  reports: "Жалобы",
  roles: "Роли",
  challenges: "Испытания",
  announcements: "Объявления",
  showcase: "Витрина",
  emojis: "Реакции",
  filter: "Фильтр слов",
  journal: "Журнал",
};

const SECTION_ICON: Record<StaffSection, IconName> = {
  server: "settings",
  invites: "user-plus",
  reports: "alert",
  roles: "shield",
  challenges: "gamepad",
  announcements: "bell",
  showcase: "image",
  emojis: "smile",
  filter: "eye-off",
  journal: "book-open",
};

type StaffPanelData = {
  invites: StaffInviteRow[];
  logs: ModerationLogRow[];
  error: string | null;
};

let staffPanelInFlight: Promise<StaffPanelData> | null = null;

function loadStaffPanel(reuseInFlight: boolean, withInvites: boolean): Promise<StaffPanelData> {
  if (reuseInFlight && staffPanelInFlight) {
    return staffPanelInFlight;
  }
  const run = Promise.allSettled([withInvites ? fetchStaffInvites() : Promise.resolve([]), fetchModerationLogs(0, 20)]).then(
    ([inviteResult, logResult]): StaffPanelData => {
      let error: string | null = null;
      const rejected = inviteResult.status === "rejected" ? inviteResult : logResult;
      if (rejected.status === "rejected") {
        const reason = rejected.reason;
        error = reason instanceof Error ? formatApiError(reason.message) : "Не удалось загрузить данные";
      }
      return {
        invites: inviteResult.status === "fulfilled" ? inviteResult.value : [],
        logs: logResult.status === "fulfilled" ? logResult.value : [],
        error,
      };
    },
  );
  if (!reuseInFlight) {
    return run;
  }
  const tracked = run.finally(() => {
    if (staffPanelInFlight === tracked) {
      staffPanelInFlight = null;
    }
  });
  staffPanelInFlight = tracked;
  return tracked;
}

interface StaffToolsProps {
  busy: boolean;
  freshCode: string | null;
  message: string | null;
  viewerIsOwner: boolean;
  viewerId: number | null;
  members: UserDirectoryEntry[];
  onClose: () => void;
  /** Снять роль ADMIN (только OWNER). `true` — выполнено. */
  onRevokeAdmin: (userId: number) => Promise<boolean>;
  /** Заблокировать аккаунт. `true` — выполнено. */
  onBanMember: (userId: number) => Promise<boolean>;
  onCreateInvite: () => Promise<void>;
  onRevokeInvite: (id: number) => Promise<void>;
}

export function StaffTools({
  busy,
  freshCode,
  message,
  viewerIsOwner,
  viewerId,
  members,
  onClose,
  onRevokeAdmin,
  onBanMember,
  onCreateInvite,
  onRevokeInvite,
}: StaffToolsProps) {
  const [section, setSection] = useState<StaffSection>(viewerIsOwner ? "server" : "reports");
  /** Узкий экран: сначала список разделов, раздел — отдельным экраном с «назад» (как в настройках голоса). */
  const [mobileMenu, setMobileMenu] = useState(true);
  const openReports = useReportStore((s) => s.openCount);
  const [invites, setInvites] = useState<StaffInviteRow[]>([]);
  const [logs, setLogs] = useState<ModerationLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const invitesEnabled = Boolean(useUserStore((st) => st.me?.user_invites_enabled));
  const [switching, setSwitching] = useState(false);
  const loadSeq = useRef(0);
  const activeInvites = invites.filter((invite) => !invite.is_revoked && !invite.used_at);

  async function loadFresh(reuseInFlight: boolean): Promise<void> {
    const seq = ++loadSeq.current;
    const data = await loadStaffPanel(reuseInFlight, viewerIsOwner);
    if (seq !== loadSeq.current) {
      return;
    }
    setInvites(data.invites);
    setLogs(data.logs);
    setLoadError(data.error);
  }

  useEffect(() => {
    let cancelled = false;
    void loadFresh(true).finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleUserInvites(next: boolean) {
    setSwitching(true);
    try {
      const saved = await patchServerSettings({ user_invites_enabled: next });
      const current = useUserStore.getState().me;
      if (current) {
        useUserStore.getState().setMe({ ...current, user_invites_enabled: saved.user_invites_enabled });
      }
      toast.success(saved.user_invites_enabled ? "Личные приглашения включены" : "Личные приглашения выключены");
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? formatApiError(error.message) : "Не удалось сохранить настройку");
    } finally {
      setSwitching(false);
    }
  }

  const sections: StaffSection[] = viewerIsOwner
    ? ["server", "invites", "reports", "roles", "challenges", "announcements", "showcase", "emojis", "filter", "journal"]
    : ["reports", "journal"];

  return (
    <Modal
      bare
      size="2xl"
      isOpen
      title="Управление сервером"
      onClose={() => {
        // Мини-профиль жалобщика живёт вне модалки — вместе с ней закрываем и его.
        useProfileCardStore.getState().close();
        onClose();
      }}
    >
      <div className="flex h-[calc(min(86vh,720px)-2px)] w-full max-md:h-full">
        <aside
          className={`${mobileMenu ? "flex" : "hidden"} w-full shrink-0 flex-col overflow-y-auto bg-surface md:flex md:w-[232px] md:border-r md:border-line`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between gap-3 pr-2 md:pr-0">
            <Heading slot="title" className="flex items-center px-4 font-heading text-lg tracking-tight">
              Управление
            </Heading>
            <IconButton icon="close" label="Закрыть" onPress={onClose} className="md:hidden" />
          </div>
          <nav className="flex flex-col gap-0.5 px-2 max-md:pb-4" aria-label="Разделы управления">
            {sections.map((id) => (
              <ListItem
                key={id}
                icon={SECTION_ICON[id]}
                active={section === id}
                onPress={() => {
                  setSection(id);
                  setMobileMenu(false);
                }}
              >
                {SECTION_TITLE[id]}
                {id === "reports" && openReports > 0 ? <Counter value={openReports} className="ml-1.5" /> : null}
              </ListItem>
            ))}
          </nav>
        </aside>

        <div className={`${mobileMenu ? "hidden" : "flex"} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line pl-6 pr-4 max-md:pl-2 max-md:pr-2">
            <IconButton
              icon="arrow-left"
              label="К разделам управления"
              onPress={() => setMobileMenu(true)}
              className="-mr-1 md:hidden"
            />
            <h2 className="min-w-0 flex-1 truncate font-heading text-xl tracking-tight">{SECTION_TITLE[section]}</h2>
            <IconButton icon="close" label="Закрыть" onPress={onClose} />
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-5 max-md:px-4 [&>*]:shrink-0">
            {loading ? (
              <div className="flex min-h-40 items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <>
                {loadError ? (
                  <Alert tone="danger" compact>
                    {loadError}
                  </Alert>
                ) : null}

                {section === "invites" && viewerIsOwner ? (
                  <div className="flex flex-col gap-6">
                    <SettingRow
                      title="Приглашения участников"
                      description="Каждому участнику доступны 3 личных кода. При выключении коды перестают работать и возвращаются после включения."
                    >
                      <Switch
                        aria-label="Приглашения участников"
                        isSelected={invitesEnabled}
                        isDisabled={switching}
                        onChange={(next) => {
                          void toggleUserInvites(next);
                        }}
                      />
                    </SettingRow>
                    <FieldGroup
                      title="Коды администрации"
                      description={`Одноразовые коды для регистрации без личного приглашения. Активных: ${activeInvites.length}.`}
                      aside={
                        <Button
                          size="sm"
                          leadingIcon="plus"
                          isPending={busy}
                          onPress={() => {
                            void onCreateInvite().then(() => loadFresh(false));
                          }}
                        >
                          Новый код
                        </Button>
                      }
                    >
                      {message ? (
                        <Alert tone="warning" compact>
                          {message}
                        </Alert>
                      ) : null}
                      {activeInvites.length === 0 ? (
                        <EmptyState compact title="Активных кодов нет." />
                      ) : (
                        <ul className="grid gap-2 sm:grid-cols-2">
                          {activeInvites.map((invite) => {
                            const expired = invite.expires_at ? new Date(invite.expires_at).getTime() < Date.now() : false;
                            return (
                              <li key={invite.id}>
                                <InviteCodeCard
                                  className="h-full"
                                  code={invite.code}
                                  link={buildInviteLink(invite.code)}
                                  highlighted={invite.code === freshCode}
                                  note={`создал ${invite.created_by_username}${expired ? " · истёк" : ""}`}
                                  actions={
                                    <IconButton
                                      size="sm"
                                      variant="danger"
                                      icon="trash"
                                      label="Удалить код"
                                      isDisabled={busy}
                                      onPress={() => {
                                        void onRevokeInvite(invite.id).then(() => loadFresh(false));
                                      }}
                                    />
                                  }
                                />
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </FieldGroup>
                  </div>
                ) : null}

                {section === "reports" ? (
                  <ReportsPanel
                    viewerId={viewerId}
                    viewerIsOwner={viewerIsOwner}
                    onRevokeAdmin={onRevokeAdmin}
                    onBanMember={onBanMember}
                  />
                ) : null}

                {section === "server" && viewerIsOwner ? <ServerPanel /> : null}
                {section === "roles" && viewerIsOwner ? <RolesPanel members={members} /> : null}
                {section === "challenges" && viewerIsOwner ? <ChallengesAdminPanel /> : null}
                {section === "announcements" && viewerIsOwner ? <AnnouncementsPanel members={members} /> : null}
                {section === "showcase" && viewerIsOwner ? <CosmeticTextsPanel /> : null}
                {section === "emojis" && viewerIsOwner ? <EmojisPanel /> : null}
                {section === "filter" && viewerIsOwner ? <WordFilterPanel /> : null}

                {section === "journal" ? (
                  <>
                    {logs.length === 0 && !loadError ? <EmptyState compact title="Записей пока нет." /> : null}
                    {logs.length > 0 ? (
                      <ul className="divide-y divide-line border border-line">
                        {logs.map((row) => (
                          <li key={row.id} className="flex items-start gap-4 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-fg">{journalHeadline(row)}</p>
                              {row.reason ? (
                                <p className="mt-0.5 break-words text-xs leading-relaxed text-muted">
                                  {row.action === "MESSAGE_DELETE" || row.action.startsWith("ANNOUNCEMENT_")
                                    ? `«${row.reason}»`
                                    : row.action.startsWith("EMOJI_")
                                    ? `:${row.reason}:`
                                    : formatReason(row.reason)}
                                </p>
                              ) : null}
                            </div>
                            <time dateTime={row.created_at} className="shrink-0 pt-0.5 font-label text-[11px] tabular-nums text-muted">
                              {formatWhen(row.created_at)}
                            </time>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function journalHeadline(row: ModerationLogRow): string {
  if (row.action === "INVITE_USED") {
    return row.target_username
      ? `${row.actor_username} зарегистрировался по приглашению ${row.target_username}`
      : `${row.actor_username} зарегистрировался по инвайту`;
  }
  const label = ACTION_LABEL[row.action] ?? row.action;
  if (row.target_username && row.action !== "CHANNEL_DELETE" && !row.action.startsWith("INVITE_")) {
    return `${label} · ${row.actor_username} → ${row.target_username}`;
  }
  return `${label} · ${row.actor_username}`;
}

/** Имя значка или титула из каталога косметики; каталог не загружен или id удалён — сам id. */
function cosmeticName(kind: "badge" | "title", id: string): string {
  const catalog = useAvatarStore.getState().catalog;
  const name =
    kind === "badge"
      ? catalog?.badges.find((item) => item.id === id)?.name
      : catalog?.titles.find((item) => item.id === id)?.label;
  return name ?? id;
}

const LISTED_KIND: Record<string, string> = { badge: "значок", title: "титул", frame: "рамка", background: "фон", character: "персонаж" };

function formatReason(reason: string): string {
  // Витрина/запас: `<kind> <id> listed|reserved` — раньше разбора значка роли (`badge <роль> <id>`).
  const listed = /^(badge|title|frame|background|character) (\S+) (listed|reserved)$/.exec(reason);
  if (listed) {
    const [, kind = "", id = "", state] = listed;
    const name = kind === "badge" || kind === "title" ? cosmeticName(kind, id) : id;
    return `${LISTED_KIND[kind]} «${name}» ${state === "listed" ? "на витрине" : "в запасе"}`;
  }
  const cosmetic = /^(badge|title) (\S+)$/.exec(reason);
  if (cosmetic) {
    const kind = cosmetic[1] === "badge" ? "badge" : "title";
    return `${kind === "badge" ? "значок" : "титул"} «${cosmeticName(kind, cosmetic[2] ?? "")}»`;
  }
  const roleBadge = /^badge (.+) (\S+)$/.exec(reason);
  if (roleBadge) {
    const badge = roleBadge[2] === "none" ? "без значка" : `«${cosmeticName("badge", roleBadge[2] ?? "")}»`;
    return `значок роли «${roleBadge[1]}»: ${badge}`;
  }
  const assign = /^assign (.+)$/.exec(reason);
  if (assign) {
    return assign[1] === "ADMIN" ? "назначен админ" : `выдана роль «${assign[1]}»`;
  }
  const remove = /^remove (.+)$/.exec(reason);
  if (remove) {
    return remove[1] === "ADMIN" ? "админ снят" : `снята роль «${remove[1]}»`;
  }
  const create = /^create (.+)$/.exec(reason);
  if (create) {
    return `создана роль «${create[1]}»`;
  }
  const removed = /^delete (.+)$/.exec(reason);
  if (removed) {
    return `удалена роль «${removed[1]}»`;
  }
  const permissions = /^permissions (.+)$/.exec(reason);
  if (permissions) {
    return `изменены права роли «${permissions[1]}»`;
  }
  const rename = /^rename (.+) → (.+)$/.exec(reason);
  if (rename) {
    return `роль «${rename[1]}» переименована в «${rename[2]}»`;
  }
  return reason;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Outlet, matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  createInvite,
  logout,
  resetMeClientCache,
  updateMyPresence,
  type MeResponse,
} from "../../shared/api/auth";
import { ensureAccessTokenFresh, isTerminalAuthFailure } from "../../shared/api/token-refresh";
import { formatApiError } from "../../shared/api/format-error";
import {
  revokeStaffInvite,
} from "../../shared/api/invites";
import {
  postDisplayNameLock,
  postModerationBan,
  postModerationKick,
} from "../../shared/api/moderation";
import {
  fetchUsersDirectory,
  type UserDirectoryEntry,
} from "../../shared/api/users";
import { assignRole, removeRole } from "../../shared/api/roles";
import { memberGroupRole, useRoleStore } from "@/stores/role-store";
import { getAccessToken, getRefreshToken } from "../../shared/lib/auth-storage";
import { clearSessionClient, getSessionEpoch } from "../../shared/lib/session-reset";
import {
  connectAppRealtime,
  disconnectAppRealtime,
  subscribeRealtime,
} from "../../shared/ws/app-realtime";
import { useChannelStore } from "../../stores/channel-store";
import { useGameActivity } from "@/features/presence/use-game-activity";
import { usePresenceActivity } from "@/features/presence/use-presence-activity";
import {
  isPresencePreference,
  isPublicPresenceStatus,
  PUBLIC_STATUS_LABEL,
  type PresencePreference,
  type PublicPresenceStatus,
} from "@/shared/presence";
import { usePresenceStore } from "../../stores/presence-store";
import { useUserStore } from "../../stores/user-store";
import { useVoiceStore } from "../../stores/voice-store";
import { useVoiceRoomsStore } from "../../stores/voice-rooms-store";
import {
  leaveVoiceChannel,
  syncVoiceMembershipFromSnapshot,
  teardownVoiceSessionWs,
  VoiceSessionHost,
  VoiceSessionProvider,
  useVoiceSessionUi,
} from "@/features/voice/voice-session";
import { LiveBadgeBridge } from "@/features/screenshare/LiveBadgeBridge";
import { VoiceOverlayBridge } from "@/features/voice/voice-overlay/VoiceOverlayBridge";
import { ScreenShareHostStage } from "@/features/screenshare/ScreenShareHostStage";
import { ScreenShareStage } from "@/features/screenshare/ScreenShareStage";
import { ScreenShareStartModal } from "@/features/screenshare/ScreenShareStartModal";
import { ScreenShareSwitchDialogs } from "@/features/screenshare/ScreenShareSwitchDialogs";
import { ScreenShareWatchGuard } from "@/features/screenshare/ScreenShareWatchGuard";
import { useScreenShareStore } from "@/features/screenshare/screen-share-store";
import { useChatMessageSound } from "@/features/chat/use-chat-message-sound";
import { useDesktopToasts } from "@/features/desktop-toasts/use-desktop-toasts";
import { VoiceSettingsProvider } from "@/features/voice/voice-settings";
import { hasSeenInvites, markInvitesSeen } from "@/shared/lib/invites-seen";
import { apiUrl } from "@/shared/api/http";
import { useServerFavicon } from "@/features/server-icon/use-server-favicon";
import { Alert, Button, Counter, IconButton, ServerIcon, ToastHost, Tooltip, UnreadDot, toast } from "@/shared/ui";
import { openVoiceSettings } from "@/features/voice/voice-settings";
import { UserDock } from "@/widgets/user-dock/UserDock";
import { ProfileEditDialog, type ProfileEditTab } from "@/widgets/profile-edit/ProfileEditDialog";
import { useAvatarStore } from "@/stores/avatar-store";
import { useChallengeStore } from "@/stores/challenge-store";
import { playChallengeCompleteSound } from "@/features/ui-sounds/ui-sounds";
import { rewardsText } from "@/features/challenges/reward-names";
import type { CosmeticKind, CosmeticReward } from "@/shared/api/challenges";
import type { UserAvatar } from "@/shared/api/avatars";
import { AsideUsers, canManageMember, type OnlineGroup } from "@/widgets/aside-users";
import { MemberActions } from "@/widgets/member-actions/MemberActions";
import { postReport } from "@/shared/api/reports";
import { useReportStore } from "@/stores/report-store";
import { useAnnouncementStore } from "@/stores/announcement-store";
import { useEmojiStore } from "@/stores/emoji-store";
import { hasProfileNews, useProfileNewsStore } from "@/stores/profile-news-store";
import { AnnouncementDialog } from "@/widgets/announcements";
import { UserProfileCardHost } from "@/widgets/user-profile-card";
import { useProfileCardStore } from "@/widgets/user-profile-card/profile-card-store";
import { useMemberProfileStore } from "@/stores/member-profile-store";
import { displayNameOf } from "@/shared/lib/display-name";
import { AsideChannels } from "@/widgets/aside-channels";
import { MyInvitesDialog } from "@/widgets/my-invites";
import { StaffTools } from "@/widgets/staff-tools";
import { BootSplash } from "@/shared/ui/boot-splash/BootSplash";
import { useBreakpoint } from "@/hooks/use-breakpoint";

export type AppShellOutletContext = {
  me: MeResponse | null;
  membersOpen: boolean;
  toggleMembers: () => void;
  /** Только на узком экране: вернуться к списку каналов. */
  openChannels?: () => void;
};

/** На узком экране (< md) видна одна панель оболочки. */
type MobilePane = "channels" | "content" | "members";

function paneForPath(pathname: string): MobilePane {
  return matchPath("/app/channels/:channelId", pathname) ? "content" : "channels";
}

let directoryRequestSeq = 0;

/**
 * Список участников запрашивают реконнект, `member:*`, `role:update` и модерация — ответы могут прийти не по порядку.
 * Побеждает последний запрос: `null` — ответ устарел (ушёл более новый запрос или сменилась сессия).
 */
async function fetchLatestDirectory(): Promise<UserDirectoryEntry[] | null> {
  const seq = ++directoryRequestSeq;
  const epoch = getSessionEpoch();
  const current = () => seq === directoryRequestSeq && epoch === getSessionEpoch();
  try {
    const rows = await fetchUsersDirectory();
    return current() ? rows : null;
  } catch (error: unknown) {
    if (!current()) {
      return null;
    }
    throw error;
  }
}

function parseUserAvatar(raw: unknown): UserAvatar | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const body = raw as Record<string, unknown>;
  const id = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
  const avatar = { character: id(body.character), background: id(body.background), frame: id(body.frame) };
  return avatar.character || avatar.background || avatar.frame ? avatar : null;
}

function mergeDirectoryStores(rows: UserDirectoryEntry[]): void {
  usePresenceStore
    .getState()
    .mergeFromUsers(rows.map((u) => ({ id: u.id, status: u.status, game: u.game ?? null })));
  useAvatarStore
    .getState()
    .mergeFromUsers(rows.map((u) => ({ id: u.id, avatar: u.avatar ?? null, badges: u.badges, title: u.title })));
  useMemberProfileStore.getState().setFromDirectory(rows);
}

/** Фоновые подписки оболочки. Свои ререндеры (непрочитанное, роут, окно) не тянут за собой весь layout. */
function ShellBackgroundHooks() {
  useChatMessageSound();
  useDesktopToasts();
  usePresenceActivity();
  useGameActivity();
  return null;
}

/** Панель участников сама слушает presence: смена статуса не перерисовывает чат и сайдбар каналов. */
function MembersAside({
  members,
  viewerId,
  onOpenMember,
  onBack,
}: {
  members: UserDirectoryEntry[];
  viewerId: number | null;
  onOpenMember: (member: UserDirectoryEntry, point: { x: number; y: number }) => void;
  /** Узкий экран: панель на всю ширину, в шапке кнопка «назад». */
  onBack?: () => void;
}) {
  const statusByUserId = usePresenceStore((s) => s.statusByUserId);
  const gameByUserId = usePresenceStore((s) => s.gameByUserId);
  const roleCatalog = useRoleStore((s) => s.roles);
  const memberGroups = useMemo(() => {
    // Группы ролей с hoist — в порядке приоритета, затем общая «Онлайн».
    const roleGroups = new Map<number, OnlineGroup>();
    for (const role of roleCatalog) {
      if (role.hoist && role.key !== "MEMBER") {
        roleGroups.set(role.id, { key: `role:${role.id}`, label: role.name, members: [] });
      }
    }
    const online: OnlineGroup = { key: "online", label: "Онлайн", members: [] };
    const offlineMembers: UserDirectoryEntry[] = [];

    for (const member of members) {
      const status = statusByUserId[member.id] ?? member.status;
      const game =
        status === "offline"
          ? null
          : member.id in gameByUserId
            ? gameByUserId[member.id]
            : (member.game ?? null);
      const row =
        member.status === status && (member.game ?? null) === game
          ? member
          : { ...member, status, is_online: status !== "offline", game };

      if (status !== "offline") {
        const groupRole = memberGroupRole(roleCatalog, member.role_ids);
        const group = (groupRole ? roleGroups.get(groupRole.id) : undefined) ?? online;
        group.members.push(row);
      } else {
        offlineMembers.push(row);
      }
    }

    return { onlineGroups: [...roleGroups.values(), online], offlineMembers };
  }, [members, statusByUserId, gameByUserId, roleCatalog]);

  return (
    <aside className={`flex ${onBack ? "w-full border-0 pb-safe" : "w-[240px] border"} shrink-0 flex-col overflow-hidden border-line bg-bg`}>
      {onBack ? (
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line pl-2 pr-3 text-sm font-semibold">
          <IconButton icon="arrow-left" label="Назад к чату" onPress={onBack} />
          <span className="min-w-0 flex-1 truncate">Участники</span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AsideUsers
          onlineGroups={memberGroups.onlineGroups}
          offlineMembers={memberGroups.offlineMembers}
          viewerId={viewerId}
          onOpenMember={onOpenMember}
        />
      </div>
    </aside>
  );
}

/** Вкладка конструктора профиля, где лежит награда испытания. */
function rewardTab(kind: CosmeticKind): ProfileEditTab {
  return kind === "badge" ? "badges" : kind;
}

export function AppShellLayout() {
  const navigate = useNavigate();
  const channels = useChannelStore((s) => s.channels);
  const channelsLoaded = useChannelStore((s) => s.loaded);
  const me = useUserStore((s) => s.me);
  const [members, setMembers] = useState<UserDirectoryEntry[]>([]);
  const selfPreference = usePresenceStore((s) => s.selfPreference);
  const meIdForPresence = me?.id ?? null;
  const publishedSelf = usePresenceStore((s) =>
    meIdForPresence === null ? undefined : s.statusByUserId[meIdForPresence],
  );
  const watchingChannelId = useScreenShareStore((s) => s.watchingChannelId);
  const screenSharePresentation = useScreenShareStore((s) => s.presentation);
  const hostView = useScreenShareStore((s) => s.hostView);
  const screenShareStageOpen =
    (watchingChannelId != null && screenSharePresentation === "stage") || hostView === "stage";
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const adminRoleId = useRoleStore((s) => s.roles.find((role) => role.key === "ADMIN")?.id ?? null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [realtimeDown, setRealtimeDown] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);
  const wide = useBreakpoint("md");
  const location = useLocation();
  const [mobilePane, setMobilePane] = useState<MobilePane>(() => paneForPath(location.pathname));
  const [paneLocationKey, setPaneLocationKey] = useState(location.key);
  if (paneLocationKey !== location.key) {
    // Переход по каналу открывает чат на телефоне (повторный тап по открытому — `showChannelContent`).
    setPaneLocationKey(location.key);
    setMobilePane(paneForPath(location.pathname));
  }
  const [managed, setManaged] = useState<{ id: number; x: number; y: number; step?: "report" } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileEditTab>("character");
  // Новое открытие перемонтирует конструктор: уже открытый переходит на нужную вкладку.
  const [profileOpenSeq, setProfileOpenSeq] = useState(0);
  const profileNews = useProfileNewsStore((s) => s.news);
  function openProfile(tab: ProfileEditTab) {
    setProfileTab(tab);
    setProfileOpenSeq((n) => n + 1);
    setProfileOpen(true);
  }
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [myInvitesOpen, setMyInvitesOpen] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootNonce, setBootNonce] = useState(0);
  const reconnectingRef = useRef(false);
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => {
    navigateRef.current = navigate;
  });

  useEffect(() => {
    let cancelled = false;
    const unsub = subscribeRealtime((event, data) => {
      const reloadDirectory = () => {
        void fetchLatestDirectory()
          .then((rows) => {
            if (!rows) {
              return;
            }
            setMembers(rows);
            mergeDirectoryStores(rows);
          })
          .catch((error: unknown) => {
            setMemberMessage(
              error instanceof Error
                ? formatApiError(error.message, "Не удалось обновить список участников")
                : "Не удалось обновить список участников",
            );
          });
      };
      if (event === "connection:status") {
        const state = data.state;
        if (state === "reconnecting") {
          reconnectingRef.current = true;
        }
        setRealtimeDown(state === "reconnecting");
        if (state === "online" && reconnectingRef.current) {
          reconnectingRef.current = false;
          reloadDirectory();
          void useRoleStore.getState().load();
          void useReportStore.getState().loadMine();
          void useReportStore.getState().loadOpenCount();
          void useAnnouncementStore.getState().load();
          void useProfileNewsStore.getState().load();
          void useEmojiStore.getState().load();
          void useChannelStore.getState().fetchChannels({ force: true });
          resetMeClientCache();
          void useUserStore.getState().fetchMe({ force: true });
        }
        return;
      }
      if (event === "auth:force_logout") {
        const code = typeof data.code === "string" ? data.code : "";
        clearSessionClient();
        disconnectAppRealtime();
        navigateRef.current("/login", {
          replace: true,
          state:
            code === "KICKED"
              ? {
                  notice:
                    "Вас исключили из сообщества. Вернуться можно регистрацией с новым инвайтом.",
                }
              : undefined,
        });
        return;
      }
      if (event === "presence:user_status") {
        const uid = data.user_id;
        if (typeof uid === "number" && isPublicPresenceStatus(data.status)) {
          usePresenceStore.getState().setStatus(uid, data.status);
          if (data.status === "offline") {
            usePresenceStore.getState().setGame(uid, null);
          }
        }
      }
      if (event === "presence:activity") {
        const uid = data.user_id;
        if (typeof uid !== "number") {
          return;
        }
        if (data.game === null) {
          usePresenceStore.getState().setGame(uid, null);
        } else if (typeof data.game === "string" && data.game.trim()) {
          usePresenceStore.getState().setGame(uid, data.game.trim());
        }
      }
      // Ссылка на аватар сервера подписана на сутки: каждое подключение сокета приносит свежую.
      if (event === "auth:success") {
        const server = data.server as { server_icon_url?: unknown } | null | undefined;
        const current = useUserStore.getState().me;
        if (current && server && "server_icon_url" in server) {
          const url = typeof server.server_icon_url === "string" ? server.server_icon_url : null;
          if (url !== (current.server_icon_url ?? null)) {
            useUserStore.getState().setMe({ ...current, server_icon_url: url });
          }
        }
      }
      if (event === "server:settings") {
        const current = useUserStore.getState().me;
        if (current && typeof data.user_invites_enabled === "boolean") {
          useUserStore.getState().setMe({
            ...current,
            user_invites_enabled: data.user_invites_enabled,
            // Старый сервер поля не присылает — оставляем, что было.
            server_icon_url:
              "server_icon_url" in data
                ? typeof data.server_icon_url === "string"
                  ? data.server_icon_url
                  : null
                : current.server_icon_url,
          });
        }
        if (data.user_invites_enabled === false) {
          setMyInvitesOpen(false);
        }
        return;
      }
      if (event === "profile:news") {
        void useProfileNewsStore.getState().load();
        return;
      }
      if (event === "announcement:new") {
        void useAnnouncementStore.getState().load();
        return;
      }
      if (event === "emoji:list_changed") {
        void useEmojiStore.getState().load();
        return;
      }
      if (event === "report:count") {
        if (typeof data.open_count === "number") {
          useReportStore.getState().setOpenCount(data.open_count);
        }
        return;
      }
      if (event === "report:resolved") {
        if (typeof data.target_user_id === "number") {
          useReportStore.getState().unmarkReported(data.target_user_id);
        }
        return;
      }
      if (event === "presence:preference") {
        if (isPresencePreference(data.status)) {
          usePresenceStore.getState().setSelfPreference(data.status);
          const current = useUserStore.getState().me;
          if (current && current.presence !== data.status) {
            useUserStore.getState().setMe({ ...current, presence: data.status });
          }
        }
      }
      if (event === "voice:rooms_snapshot") {
        const rooms = data.rooms;
        if (Array.isArray(rooms)) {
          const typed = rooms as {
            channel_id: number;
            participants: {
              user_id: number;
              username: string;
              muted: boolean;
              server_muted?: boolean;
              speak_denied?: boolean;
              deafened: boolean;
              speaking?: boolean;
            }[];
          }[];
          useVoiceRoomsStore.getState().setFromSnapshot(typed);
          syncVoiceMembershipFromSnapshot(typed);
        }
      }
      if (event === "channel:list_changed") {
        void useChannelStore.getState().fetchChannels({ force: true });
      }
      if (event === "member:joined" || event === "member:removed") {
        reloadDirectory();
      }
      if (event === "roles:changed") {
        void useRoleStore.getState().load();
        // Удалённая роль снята со всех: у участников поменялись role_ids.
        if (data.reason === "deleted") {
          reloadDirectory();
        }
        // Запреты ролей могли поменяться — свои права берём из /auth/me и списка каналов.
        resetMeClientCache();
        void useUserStore.getState().fetchMe({ force: true });
        void useChannelStore.getState().fetchChannels({ force: true });
      }
      if (event === "role:update") {
        const uid = data.user_id;
        reloadDirectory();
        const current = useUserStore.getState().me;
        if (typeof uid === "number" && current && current.id === uid) {
          resetMeClientCache();
          void useUserStore.getState().fetchMe({ force: true });
          void useChannelStore.getState().fetchChannels({ force: true });
        }
      }
      if (event === "cosmetics:changed") {
        // Владелец поправил тексты значков или титулов в витрине.
        void useAvatarStore.getState().refreshCatalog();
        return;
      }
      if (event === "challenges:changed") {
        // Опубликовали или архивировали испытание: сменились замки на косметике и список испытаний.
        void useAvatarStore.getState().refreshCatalog();
        void useProfileNewsStore.getState().load();
        if (useChallengeStore.getState().mine) {
          void useChallengeStore.getState().load();
        }
        return;
      }
      if (event === "challenge:completed") {
        const rewards = Array.isArray(data.rewards) ? (data.rewards as CosmeticReward[]) : [];
        playChallengeCompleteSound();
        const tab = rewards.length > 0 ? rewardTab(rewards[0].kind) : "challenges";
        toast.success({
          title: `Испытание «${typeof data.title === "string" ? data.title : ""}» выполнено`,
          description: rewards.length > 0 ? `Награда: ${rewardsText(useAvatarStore.getState().catalog, rewards)}` : undefined,
          duration: 8000,
          action: {
            label: rewards.length > 0 ? "Посмотреть награду" : "К испытаниям",
            onPress: () => {
              setProfileTab(tab);
              setProfileOpenSeq((n) => n + 1);
              setProfileOpen(true);
            },
          },
        });
        void useAvatarStore.getState().refreshCatalog();
        if (useChallengeStore.getState().mine) {
          void useChallengeStore.getState().load();
        }
        return;
      }
      if (event === "user:updated") {
        // В событии только изменившиеся поля: avatar, display_name (+ display_name_locked), badges + title (витрина).
        const uid = data.user_id;
        if (typeof uid !== "number") {
          return;
        }
        const patch: Partial<
          Pick<UserDirectoryEntry, "avatar" | "display_name" | "display_name_locked" | "badges" | "title">
        > = {};
        if (Array.isArray(data.badges)) {
          patch.badges = data.badges.filter((id): id is string => typeof id === "string");
          patch.title = typeof data.title === "string" ? data.title : null;
          useAvatarStore.getState().setShowcase(uid, { badges: patch.badges, title: patch.title });
        }
        if ("avatar" in data) {
          patch.avatar = parseUserAvatar(data.avatar);
          useAvatarStore.getState().setAvatar(uid, patch.avatar);
        }
        if ("display_name" in data) {
          patch.display_name = typeof data.display_name === "string" ? data.display_name : null;
          useMemberProfileStore.getState().setDisplayName(uid, patch.display_name);
        }
        if (typeof data.display_name_locked === "boolean") {
          patch.display_name_locked = data.display_name_locked;
        }
        if (Object.keys(patch).length === 0) {
          return;
        }
        setMembers((prev) => prev.map((member) => (member.id === uid ? { ...member, ...patch } : member)));
        const current = useUserStore.getState().me;
        if (current && current.id === uid) {
          useUserStore.getState().setMe({ ...current, ...patch });
        }
      }
    });
    if (!getAccessToken() && !getRefreshToken()) {
      navigateRef.current("/login", { replace: true });
      return () => {
        unsub();
      };
    }
    setBootError(null);
    const bootStartedAt = Date.now();
    const bootEpoch = getSessionEpoch();
    void (async () => {
      if (cancelled || bootEpoch !== getSessionEpoch()) {
        return;
      }
      await ensureAccessTokenFresh().catch(() => {});
      if (!getAccessToken()) {
        if (!cancelled) {
          clearSessionClient();
          navigateRef.current("/login", { replace: true });
        }
        return;
      }
      if (!cancelled) {
        connectAppRealtime();
      }
      const failBoot = (message: string) => {
        if (cancelled) {
          return;
        }
        if (isTerminalAuthFailure(message) || !getAccessToken()) {
          clearSessionClient();
          navigateRef.current("/login", { replace: true });
          return;
        }
        setBootError("Не удалось связаться с сервером.");
      };
      try {
        const m = await useUserStore.getState().fetchMe();
        if (cancelled) {
          return;
        }
        if (!m) {
          failBoot(useUserStore.getState().error ?? "");
          return;
        }
      } catch (e: unknown) {
        failBoot(e instanceof Error ? e.message : "");
        return;
      }
      void useRoleStore.getState().load();
      void useReportStore.getState().loadMine();
      void useAnnouncementStore.getState().load();
      void useProfileNewsStore.getState().load();
      void useEmojiStore.getState().load();
      try {
        const rows = await fetchLatestDirectory();
        if (cancelled || bootEpoch !== getSessionEpoch()) {
          return;
        }
        // `null` — пока грузились, по WS пришло событие и ушёл более новый запрос: он и применит список.
        if (rows) {
          setMembers(rows);
          mergeDirectoryStores(rows);
        }
      } catch {
        if (!cancelled) {
          setMembers([]);
        }
      }
      await useChannelStore.getState().fetchChannels({ force: true });
      if (cancelled || bootEpoch !== getSessionEpoch()) {
        return;
      }
      const channelState = useChannelStore.getState();
      if (!channelState.loaded) {
        failBoot(channelState.error ?? "Не удалось загрузить каналы.");
        return;
      }
      const waitMs = Math.max(0, 1000 - (Date.now() - bootStartedAt));
      if (waitMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      }
      if (!cancelled && bootEpoch === getSessionEpoch()) {
        setShellReady(true);
      }
    })();
    return () => {
      cancelled = true;
      unsub();
      disconnectAppRealtime();
      teardownVoiceSessionWs();
      useVoiceRoomsStore.getState().clear();
    };
    // Только mount/unmount /app и повтор загрузки — смена текстового канала не должна рвать WS и голос.
  }, [bootNonce]);

  useEffect(() => {
    if (!me) {
      return;
    }
    const tick = () => {
      void ensureAccessTokenFresh().catch(() => {});
    };
    const iv = window.setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [me]);

  const staff =
    me && (me.roles.includes("OWNER") || me.roles.includes("ADMIN"));
  const viewerIsOwner = Boolean(me?.roles.includes("OWNER"));
  const invitesEnabled = Boolean(me?.user_invites_enabled);
  const openReports = useReportStore((s) => s.openCount);
  const reportedIds = useReportStore((s) => s.reportedIds);
  useEffect(() => {
    if (staff) {
      void useReportStore.getState().loadOpenCount();
    }
  }, [staff]);

  async function onReport(userId: number, reason: string): Promise<boolean> {
    setMemberBusy(true);
    setMemberMessage(null);
    try {
      await postReport(userId, reason);
      useReportStore.getState().markReported(userId);
      toast.success("Жалоба отправлена");
      return true;
    } catch (e: unknown) {
      setMemberMessage(e instanceof Error ? formatApiError(e.message) : "Ошибка");
      return false;
    } finally {
      setMemberBusy(false);
    }
  }

  /** `errorToast` — показать ошибку тостом (карточка профиля), иначе она уходит в `memberMessage` окна действий. */
  async function onToggleRole(
    userId: number,
    roleId: number | null,
    on: boolean,
    doneMessage: string,
    errorToast = false,
  ): Promise<boolean> {
    if (roleId === null) {
      if (errorToast) {
        toast.error("Роли ещё не загружены");
      } else {
        setMemberMessage("Роли ещё не загружены");
      }
      return false;
    }
    setMemberBusy(true);
    setMemberMessage(null);
    try {
      const updated = on ? await assignRole(roleId, userId) : await removeRole(roleId, userId);
      setMembers((prev) =>
        prev.map((member) =>
          member.id === updated.user_id ? { ...member, roles: updated.roles, role_ids: updated.role_ids } : member,
        ),
      );
      useMemberProfileStore.getState().setRoles(updated.user_id, updated.roles, updated.role_ids);
      toast.success(doneMessage);
      return true;
    } catch (e: unknown) {
      const text = e instanceof Error ? formatApiError(e.message) : "Не удалось изменить роль";
      if (errorToast) {
        toast.error(text);
      } else {
        setMemberMessage(text);
      }
      return false;
    } finally {
      setMemberBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function onCreateInvite() {
    setBusy(true);
    setInviteCode(null);
    try {
      const r = await createInvite();
      setInviteCode(r.code);
    } catch (error: unknown) {
      setAdminMsg(
        error instanceof Error
          ? formatApiError(error.message, "Не удалось создать приглашение")
          : "Не удалось создать приглашение",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeInvite(id: number) {
    setBusy(true);
    setAdminMsg(null);
    try {
      await revokeStaffInvite(id);
    } catch (e: unknown) {
      setAdminMsg(e instanceof Error ? formatApiError(e.message) : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function runModeration(
    userId: number,
    fn: (userId: number, reason?: string) => Promise<void>,
    label: string,
    reason: string,
    errorToast = false,
  ): Promise<boolean> {
    setMemberBusy(true);
    setMemberMessage(null);
    try {
      await fn(userId, reason.trim() || undefined);
      // Список участников обновит WS (`member:removed` и др.) — отдельный запрос был бы дублем.
      toast.success(label);
      return true;
    } catch (e: unknown) {
      const text = e instanceof Error ? formatApiError(e.message) : "Ошибка";
      if (errorToast) {
        toast.error(text);
      } else {
        setMemberMessage(text);
      }
      return false;
    } finally {
      setMemberBusy(false);
    }
  }

  const textCh = useMemo(() => channels.filter((c) => c.channel_type === "TEXT"), [channels]);
  const voiceCh = useMemo(() => channels.filter((c) => c.channel_type === "VOICE"), [channels]);
  const toggleMembers = useCallback(() => {
    if (wide) {
      setMembersOpen((open) => !open);
    } else {
      setMobilePane((pane) => (pane === "members" ? "content" : "members"));
    }
  }, [wide]);
  const openChannels = useCallback(() => setMobilePane("channels"), []);
  // Тап по уже открытому каналу маршрут не меняет — возвращаем чат явно.
  const showChannelContent = useCallback(() => setMobilePane("content"), []);
  const showMembers = wide ? membersOpen : mobilePane === "members";
  const outletContext = useMemo(
    () =>
      ({
        me,
        membersOpen: wide && membersOpen,
        toggleMembers,
        openChannels: wide ? undefined : openChannels,
      }) satisfies AppShellOutletContext,
    [me, wide, membersOpen, toggleMembers, openChannels],
  );
  const onChannelDeleted = useCallback((channelId: number) => {
    const { channels: current, setChannels } = useChannelStore.getState();
    setChannels(current.filter((channel) => channel.id !== channelId));
  }, []);
  const onOpenMember = useCallback((member: UserDirectoryEntry, point: { x: number; y: number }) => {
    setMemberMessage(null);
    // Мини-профиль не должен оставаться поверх меню действий и модалок (жалоба, бан, кик).
    useProfileCardStore.getState().close();
    setManaged({ id: member.id, ...point });
  }, []);
  const onReportMember = useCallback((member: UserDirectoryEntry, point: { x: number; y: number }) => {
    setMemberMessage(null);
    useProfileCardStore.getState().close();
    setManaged({ id: member.id, ...point, step: "report" });
  }, []);
  const managedMember = managed ? (members.find((member) => member.id === managed.id) ?? null) : null;
  const voiceActiveChannelId = useVoiceStore((s) => s.activeChannelId);
  const intendedVoiceChannelId = useVoiceSessionUi((s) => s.intendedChannelId);
  const voicePanelChannelId = intendedVoiceChannelId ?? voiceActiveChannelId;
  const activeVoiceChannelName = voiceCh.find(
    (c) => c.id === voicePanelChannelId
  )?.name;

  useEffect(() => {
    if (!channelsLoaded || voicePanelChannelId == null) {
      return;
    }
    if (channels.some((channel) => channel.id === voicePanelChannelId)) {
      return;
    }
    leaveVoiceChannel();
  }, [channels, channelsLoaded, voicePanelChannelId]);

  useEffect(() => {
    if (me?.presence) {
      usePresenceStore.getState().setSelfPreference(me.presence);
    }
  }, [me?.presence]);

  const meId = me?.id;
  const meAvatar = me?.avatar;
  useEffect(() => {
    if (meId === undefined) {
      return;
    }
    void useAvatarStore.getState().loadCatalog();
    useAvatarStore.getState().setAvatar(meId, meAvatar ?? null);
  }, [meId, meAvatar]);

  async function onPresence(next: PresencePreference) {
    const previous = usePresenceStore.getState().selfPreference;
    const previousStatus = me ? usePresenceStore.getState().statusByUserId[me.id] : undefined;
    usePresenceStore.getState().setSelfPreference(next);
    if (me) {
      const optimistic: PublicPresenceStatus = next === "invisible" ? "offline" : next;
      usePresenceStore.getState().setStatus(me.id, optimistic);
      useUserStore.getState().setMe({ ...me, presence: next });
    }
    try {
      const saved = await updateMyPresence(next);
      usePresenceStore.getState().setSelfPreference(saved.presence);
      if (me) {
        usePresenceStore.getState().setStatus(me.id, saved.status);
        const current = useUserStore.getState().me;
        if (current) {
          useUserStore.getState().setMe({ ...current, presence: saved.presence });
        }
      }
    } catch {
      usePresenceStore.getState().setSelfPreference(previous);
      if (me && previousStatus) {
        usePresenceStore.getState().setStatus(me.id, previousStatus);
      }
      const current = useUserStore.getState().me;
      if (current) {
        useUserStore.getState().setMe({ ...current, presence: previous });
      }
    }
  }

  const serverName = me?.server_name?.trim() || "Сервер";
  const serverIconSrc = me?.server_icon_url ? apiUrl(me.server_icon_url) : null;
  useServerFavicon(serverIconSrc);
  const dockBadge: PublicPresenceStatus =
    selfPreference === "invisible"
      ? "offline"
      : publishedSelf && publishedSelf !== "offline"
        ? publishedSelf
        : selfPreference === "dnd" || selfPreference === "idle"
          ? selfPreference
          : "online";
  const dockLabel = selfPreference === "invisible" ? "Невидимка" : PUBLIC_STATUS_LABEL[dockBadge];

  if (!shellReady) {
    return (
      <>
      <ShellBackgroundHooks />
      <BootSplash
        message={bootError ?? undefined}
        onRetry={
          bootError
            ? () => {
                setBootNonce((n) => n + 1);
              }
            : undefined
        }
      />
      </>
    );
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-bg pt-safe px-safe md:pb-safe max-md:fixed max-md:inset-0 max-md:h-auto" data-block="app-shell-layout">
      <ToastHost />
      <ShellBackgroundHooks />
      <VoiceSessionHost userId={me?.id ?? null} />
      <VoiceOverlayBridge channelName={activeVoiceChannelName} />
      <LiveBadgeBridge />
      <VoiceSettingsProvider
        onLogout={() => {
          void onLogout();
        }}
      />
      <div className="flex min-w-0 flex-1 gap-2 p-1 md:p-2 max-md:p-0">
        <aside
          className={`relative ${wide || mobilePane === "channels" ? "flex" : "hidden"} w-full shrink-0 flex-col overflow-hidden border border-line bg-bg max-md:border-0 max-md:pb-safe md:w-[260px]`}
        >
          <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line pl-3 pr-2 text-left text-sm font-semibold">
            <ServerIcon name={serverName} src={serverIconSrc} size="md" />
            <span className="min-w-0 flex-1 truncate">{serverName}</span>
            {invitesEnabled ? (
              <Tooltip content="Ваши инвайты" placement="bottom">
                <span className="relative inline-flex">
                  <IconButton
                    size="sm"
                    icon="user-plus"
                    label="Пригласить друзей"
                    onPress={() => {
                      if (me) {
                        markInvitesSeen(me.id);
                      }
                      setMyInvitesOpen(true);
                    }}
                  />
                  {me && !hasSeenInvites(me.id) ? (
                    <UnreadDot
                      label="Новое: пригласительные"
                      className="pointer-events-none absolute right-[3px] top-[3px] size-2.5 animate-pulse border-2 border-bg"
                    />
                  ) : null}
                </span>
              </Tooltip>
            ) : null}
            {staff ? (
              <Tooltip content="Панель администратора" placement="bottom">
                <span className="relative inline-flex">
                  <IconButton
                    size="sm"
                    icon="shield"
                    label={
                      openReports > 0
                        ? `Управление сервером: ${serverName}, новых жалоб: ${openReports}`
                        : `Управление сервером: ${serverName}`
                    }
                    onPress={() => setServerMenuOpen(true)}
                  />
                  {openReports > 0 ? (
                    <Counter value={openReports} className="pointer-events-none absolute -right-1.5 -top-1.5" />
                  ) : null}
                </span>
              </Tooltip>
            ) : null}
          </div>
          {realtimeDown ? (
            <Alert tone="warning" compact className="border-x-0 border-t-0">
              Нет связи с сервером. Подключаемся снова…
            </Alert>
          ) : null}
          <AsideChannels
            className="min-h-0 flex-1 overflow-x-clip overflow-y-auto"
            textChannels={textCh}
            voiceRooms={voiceCh}
            activeVoiceChannelId={voicePanelChannelId ?? undefined}
            members={members}
            onChannelDeleted={onChannelDeleted}
            onReportMember={onReportMember}
            onTextChannelOpen={showChannelContent}
          />
          <AnnouncementDialog />
          {myInvitesOpen && invitesEnabled ? <MyInvitesDialog onClose={() => setMyInvitesOpen(false)} /> : null}
          {staff && serverMenuOpen ? (
            <StaffTools
              busy={busy}
              freshCode={inviteCode}
              message={adminMsg}
              viewerIsOwner={viewerIsOwner}
              viewerId={me?.id ?? null}
              members={members}
              onClose={() => setServerMenuOpen(false)}
              onRevokeAdmin={(userId) => onToggleRole(userId, adminRoleId, false, "Админ снят.", true)}
              onBanMember={(userId) => runModeration(userId, postModerationBan, "Аккаунт заблокирован.", "", true)}
              onCreateInvite={onCreateInvite}
              onRevokeInvite={onRevokeInvite}
            />
          ) : null}
          <VoiceSessionProvider activeVoiceChannelName={activeVoiceChannelName} />
          <UserDock
            userId={me?.id}
            username={me ? displayNameOf(me) : "…"}
            news={hasProfileNews(profileNews) ? profileNews : null}
            onEditProfile={() => openProfile("character")}
            onOpenNews={() => openProfile(profileNews?.cosmetic_kind ? rewardTab(profileNews.cosmetic_kind) : "challenges")}
            onDismissNews={() => useProfileNewsStore.getState().markSeen()}
            preference={selfPreference}
            badge={dockBadge}
            statusLabel={dockLabel}
            onPresence={(next) => {
              void onPresence(next);
            }}
            onSettings={() => openVoiceSettings()}
          />
        </aside>
        <section
          className={`relative ${wide || mobilePane === "content" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-line bg-surface max-md:border-0 max-md:pb-safe`}
          data-block="app-shell-layout-content"
        >
          <ScreenShareWatchGuard />
          {!wide && voicePanelChannelId != null ? (
            // Узкий экран: панель голоса живёт в списке каналов — здесь напоминание и переход к ней.
            <Button
              variant="ghost"
              size="sm"
              leadingIcon="speaker"
              className="shrink-0 justify-start border-b border-line text-success"
              onPress={openChannels}
            >
              <span className="min-w-0 truncate">В голосе{activeVoiceChannelName ? `: ${activeVoiceChannelName}` : ""}</span>
            </Button>
          ) : null}
          <div
            className={screenShareStageOpen ? "hidden" : "flex h-full min-h-0 min-w-0 flex-1 flex-col"}
            aria-hidden={screenShareStageOpen || undefined}
          >
            <Outlet context={outletContext} />
          </div>
          {watchingChannelId != null ? (
            <ScreenShareStage
              membersOpen={wide && membersOpen}
              onToggleMembers={toggleMembers}
            />
          ) : null}
          {hostView !== "closed" ? (
            <ScreenShareHostStage membersOpen={wide && membersOpen} onToggleMembers={toggleMembers} />
          ) : null}
        </section>
        {showMembers ? (
          <MembersAside
            members={members}
            viewerId={me?.id ?? null}
            onOpenMember={onOpenMember}
            onBack={wide ? undefined : () => setMobilePane("content")}
          />
        ) : null}
      </div>
      {managed && managedMember ? (
        <MemberActions
          key={`${managed.id}:${managed.step ?? "menu"}`}
          member={managedMember}
          point={managed}
          initialStep={managed.step}
          viewerIsOwner={viewerIsOwner}
          canModerate={canManageMember(managedMember, me?.id, Boolean(staff))}
          reported={reportedIds.has(managedMember.id)}
          busy={memberBusy}
          message={memberMessage}
          onClose={() => setManaged(null)}
          onToggleAdmin={(makeAdmin) =>
            onToggleRole(managedMember.id, adminRoleId, makeAdmin, makeAdmin ? "Админ назначен." : "Админ снят.")
          }
          onToggleRole={(roleId, on) =>
            onToggleRole(managedMember.id, roleId, on, on ? "Роль выдана." : "Роль снята.")
          }
          onKick={(reason) => runModeration(managedMember.id, postModerationKick, "Участник исключён.", reason)}
          onBan={(reason) => runModeration(managedMember.id, postModerationBan, "Аккаунт заблокирован.", reason)}
          onToggleNameLock={(locked, reason) =>
            runModeration(
              managedMember.id,
              (userId, why) => postDisplayNameLock(userId, locked, why),
              locked ? "Имя скрыто." : "Участник снова может задать имя.",
              reason,
            )
          }
          onReport={(reason) => onReport(managedMember.id, reason)}
        />
      ) : null}
      {profileOpen && me ? (
        <ProfileEditDialog
          key={profileOpenSeq}
          userId={me.id}
          username={me.username}
          displayName={me.display_name ?? null}
          avatar={me.avatar ?? null}
          initialTab={profileTab}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}
      <UserProfileCardHost
        meId={me?.id ?? null}
        roleTools={
          viewerIsOwner
            ? {
                busy: memberBusy,
                onToggle: (userId, roleId, on) =>
                  onToggleRole(userId, roleId, on, on ? "Роль выдана." : "Роль снята.", true),
              }
            : undefined
        }
        onEditProfile={() => openProfile("character")}
        onPresence={(next) => {
          void onPresence(next);
        }}
        onOpenActions={(userId) => {
          const member = members.find((item) => item.id === userId);
          if (member) {
            onOpenMember(member, { x: window.innerWidth / 2, y: window.innerHeight / 3 });
          }
        }}
      />
      <ScreenShareStartModal />
      <ScreenShareSwitchDialogs />
    </main>
  );
}

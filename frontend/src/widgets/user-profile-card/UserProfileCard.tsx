import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { displayNameOf } from "@/shared/lib/display-name";
import { PUBLIC_STATUS_LABEL, type PresencePreference, type PublicPresenceStatus } from "@/shared/presence";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DropdownMenu,
  Icon,
  IconButton,
  MenuItem,
  ProfileCardFrame,
  ProfileCardWindow,
  ProfilePlate,
  RoleBadge,
  Tooltip,
} from "@/shared/ui";
import { PRESENCE_MENU } from "@/shared/ui/status-choice/presence-menu";
import { presenceMenuItems } from "@/shared/ui/status-choice/presence-menu-items";
import { useProfileCosmetics, useShowcase } from "@/stores/avatar-store";
import { useChannelStore } from "@/stores/channel-store";
import { useVoiceRoomsStore } from "@/stores/voice-rooms-store";
import { requestJoinScreenShare } from "@/features/screenshare/screen-share-session";
import { useScreenShareStore } from "@/features/screenshare/screen-share-store";
import { useMemberProfile } from "@/stores/member-profile-store";
import { manageableRoles, rolesOf, useRoleStore } from "@/stores/role-store";
import { usePresenceStore } from "@/stores/presence-store";
import { cx } from "@/utils/cx";
import { useIsMobile, useIsTouch } from "@/hooks/use-breakpoint";
import { PROFILE_TRIGGER_ATTR, useProfileCardStore, type ProfileCardTarget } from "./profile-card-store";
import { ShowcaseBadges, ShowcaseTitle } from "./Showcase";
import { findLiveChannelId, liveJoinState } from "./live-activity";

const CARD_WIDTH = 264;
const GAP = 8;
const EDGE = 8;

const STATUS_DOT: Record<PublicPresenceStatus, string> = {
  online: "bg-presence-online",
  idle: "bg-presence-idle",
  dnd: "bg-presence-dnd",
  offline: "bg-presence-offline",
};

/** Статус в нижней полосе рамки. Для себя — кнопка с меню выбора статуса, для остальных (и в превью конструктора) — просто табличка. */
export function StatusPlate({
  status,
  selfPreference,
  onPresence,
}: {
  status: PublicPresenceStatus;
  selfPreference: PresencePreference | null;
  onPresence: (next: PresencePreference) => void;
}) {
  const selfItem = selfPreference ? PRESENCE_MENU.find((item) => item.id === selfPreference) : undefined;
  const label = selfItem?.label ?? PUBLIC_STATUS_LABEL[status];
  const dot = selfItem?.dot ?? STATUS_DOT[status];
  const content = (
    <>
      <span className={cx("size-2 shrink-0", dot)} aria-hidden="true" />
      {label}
    </>
  );

  if (!selfPreference) {
    return (
      <ProfilePlate className="h-[26px] gap-[7px] px-[9px] font-label text-[9px] uppercase tracking-[0.1em] text-fg">
        {content}
      </ProfilePlate>
    );
  }
  return (
    <DropdownMenu
      placement="bottom end"
      aria-label="Статус"
      selectionMode="single"
      selectedKeys={[selfPreference]}
      onAction={(key) => {
        if (key !== selfPreference) {
          onPresence(key as PresencePreference);
        }
      }}
      trigger={
        <Button variant="plate" trailingIcon="chevron-down" aria-label={`Статус: ${label}`}>
          {content}
        </Button>
      }
    >
      {presenceMenuItems()}
    </DropdownMenu>
  );
}

function GameActivity({ game }: { game: string }) {
  return (
    <Card variant="outline" className="mt-3 flex items-center gap-3 p-3">
      <span className="grid size-10 shrink-0 place-items-center bg-success/15 text-success">
        <Icon name="gamepad" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">Сейчас играет в</span>
        <Tooltip content={game} plain>
          <span className="block truncate text-sm font-semibold text-fg">{game}</span>
        </Tooltip>
      </span>
    </Card>
  );
}

const LIVE_ACTION = {
  join: { label: "Присоединиться", icon: "play" },
  open: { label: "Открыть", icon: "expand" },
  watching: { label: "Вы смотрите", icon: "eye" },
  self: { label: "Развернуть превью", icon: "expand" },
} as const;

/** Блок «Сейчас в эфире»: канал трансляции и вход в неё. У своего стрима — превью ведущего. */
function LiveActivity({
  channelId,
  channelName,
  isSelf,
  onClose,
}: {
  channelId: number;
  channelName: string;
  isSelf: boolean;
  onClose: () => void;
}) {
  const watchingChannelId = useScreenShareStore((s) => s.watchingChannelId);
  const presentation = useScreenShareStore((s) => s.presentation);
  const expandToStage = useScreenShareStore((s) => s.expandToStage);
  const hostView = useScreenShareStore((s) => s.hostView);
  const hostChannelId = useScreenShareStore((s) => s.hostChannelId);
  const openHostView = useScreenShareStore((s) => s.openHostView);
  const state = liveJoinState({ isSelf, liveChannelId: channelId, watchingChannelId, presentation });
  const action = state === "self" && (hostChannelId !== channelId || hostView === "stage") ? null : LIVE_ACTION[state];

  return (
    <Card variant="outline" className="mt-3 p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center bg-accent/15 text-accent">
          <Icon name="screen" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {isSelf ? "Вы в эфире" : "Сейчас в эфире"}
            <Badge variant="live">LIVE</Badge>
          </span>
          <Tooltip content={channelName} plain>
            <span className="block truncate text-sm font-semibold text-fg">{channelName}</span>
          </Tooltip>
        </span>
      </div>
      {action ? (
        <Button
          size="sm"
          fullWidth
          className="mt-3"
          leadingIcon={action.icon}
          isDisabled={state === "watching"}
          onPress={() => {
            onClose();
            if (state === "self") {
              openHostView("stage");
            } else if (state === "open") {
              expandToStage();
            } else {
              requestJoinScreenShare(channelId);
            }
          }}
        >
          {action.label}
        </Button>
      ) : null}
    </Card>
  );
}

/** Инструменты владельца для ролей участника. `onToggle` возвращает true, когда сервер принял изменение. */
export type RoleTools = {
  busy: boolean;
  onToggle: (userId: number, roleId: number, on: boolean) => Promise<boolean>;
};

/** Роли участника; владельцу доступны «×» на снимаемых ролях и меню «+» для выдачи. Админ — через подтверждение. */
export function RoleList({
  userId,
  username,
  isSelf,
  roleTools,
}: {
  userId: number;
  username: string;
  isSelf: boolean;
  roleTools?: RoleTools;
}) {
  const profile = useMemberProfile(userId);
  const catalog = useRoleStore((s) => s.roles);
  const badges = useMemo(() => rolesOf(catalog, profile?.role_ids), [catalog, profile?.role_ids]);
  const [confirmAdmin, setConfirmAdmin] = useState(false);

  const manage = roleTools ? manageableRoles(catalog, { isSelf, roleKeys: profile?.roles ?? [] }) : null;
  const canAdd = manage !== null && (manage.admin !== null || manage.custom.length > 0);
  const owned = new Set(profile?.role_ids ?? []);
  const adminOn = manage?.admin ? owned.has(manage.admin.id) : false;

  if (badges.length === 0 && !canAdd) {
    return null;
  }

  const removable = (key: string | null) => manage !== null && (key === null || (key === "ADMIN" && manage.admin !== null));

  return (
    <>
      <ul className="flex flex-wrap items-center gap-1.5" aria-label="Роли">
        {badges.map((badge) => (
          <li key={badge.id} className="flex max-w-full">
            <RoleBadge
              chip
              color={badge.color ?? "var(--color-muted)"}
              onRemove={
                roleTools && removable(badge.key)
                  ? () => (badge.key === "ADMIN" ? setConfirmAdmin(true) : void roleTools.onToggle(userId, badge.id, false))
                  : undefined
              }
              removeLabel={`Снять роль «${badge.name}»`}
              removeDisabled={roleTools?.busy}
            >
              <span className="truncate">{badge.name}</span>
            </RoleBadge>
          </li>
        ))}
        {roleTools && manage && canAdd ? (
          <li className="flex">
            <DropdownMenu
              placement="bottom start"
              aria-label="Роли участника"
              selectionMode="multiple"
              selectedKeys={[
                ...(manage.admin && adminOn ? ["admin"] : []),
                ...manage.custom.filter((r) => owned.has(r.id)).map((r) => `r${r.id}`),
              ]}
              onAction={(key) => {
                if (roleTools.busy) {
                  return;
                }
                if (key === "admin") {
                  setConfirmAdmin(true);
                  return;
                }
                const role = manage.custom.find((r) => `r${r.id}` === key);
                if (role) {
                  void roleTools.onToggle(userId, role.id, !owned.has(role.id));
                }
              }}
              trigger={<IconButton icon="plus" size="xs" variant="solid" label="Выдать роль" isDisabled={roleTools.busy} />}
            >
              {[
                ...(manage.admin
                  ? [
                      <MenuItem key="admin" id="admin" textValue={manage.admin.name}>
                        <span className="flex items-center gap-2">
                          <RoleBadge color={manage.admin.color ?? "var(--color-muted)"} />
                          <span className="truncate">{manage.admin.name}</span>
                        </span>
                      </MenuItem>,
                    ]
                  : []),
                ...manage.custom.map((role) => (
                  <MenuItem key={role.id} id={`r${role.id}`} textValue={role.name}>
                    <span className="flex items-center gap-2">
                      <RoleBadge color={role.color ?? "var(--color-muted)"} />
                      <span className="truncate">{role.name}</span>
                    </span>
                  </MenuItem>
                )),
              ]}
            </DropdownMenu>
          </li>
        ) : null}
      </ul>
      {roleTools && manage?.admin ? (
        <ConfirmDialog
          isOpen={confirmAdmin}
          onClose={() => setConfirmAdmin(false)}
          title={adminOn ? "Снять админа?" : "Сделать админом?"}
          description={
            adminOn
              ? `${username} потеряет права администратора`
              : `${username} получит права администратора: модерация, управление каналами`
          }
          confirmLabel={adminOn ? "Снять" : "Назначить"}
          isPending={roleTools.busy}
          onConfirm={() => {
            const adminId = manage.admin?.id;
            if (adminId !== undefined) {
              void roleTools.onToggle(userId, adminId, !adminOn).then((ok) => ok && setConfirmAdmin(false));
            }
          }}
        />
      ) : null}
    </>
  );
}

const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';
/** Подложка мобильной шторки: закрывает карточку своим click, а не pointerdown (иначе нажатие «проваливается» под неё). */
const BACKDROP_ATTR = "data-profile-backdrop";

function ProfileCard({
  target,
  isSelf,
  roleTools,
  onClose,
  onEditProfile,
  onPresence,
  onOpenActions,
}: {
  target: ProfileCardTarget;
  isSelf: boolean;
  roleTools?: RoleTools;
  onClose: () => void;
  onEditProfile: () => void;
  onPresence: (next: PresencePreference) => void;
  onOpenActions?: (userId: number) => void;
}) {
  const { userId, fallbackName, anchor, side } = target;
  const cardRef = useRef<HTMLDivElement>(null);
  // Узкий экран: карточка — нижняя шторка по центру, без привязки к якорю.
  const sheet = useIsMobile();
  const isTouch = useIsTouch();
  // Диалоги, уже открытые к моменту появления карточки (например, панель админа, из которой её открыли).
  // Поверх модалки карточка рисуется выше оверлея, иначе — под ним, как раньше.
  const [baselineDialogs] = useState(() => new Set(document.querySelectorAll(DIALOG_SELECTOR)));
  const openedInModal = baselineDialogs.size > 0;
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const profile = useMemberProfile(userId);
  const cosmetics = useProfileCosmetics(userId);
  const showcase = useShowcase(userId);
  const status = usePresenceStore((s) => s.statusByUserId[userId] ?? "offline");
  const game = usePresenceStore((s) => (status === "offline" ? null : (s.gameByUserId[userId] ?? null)));
  const selfPreference = usePresenceStore((s) => (isSelf ? s.selfPreference : null));
  const channels = useChannelStore((s) => s.channels);
  const liveChannelId = useVoiceRoomsStore((s) => findLiveChannelId(s.screenShareByChannelId, channels, userId));
  const liveChannelName = channels.find((channel) => channel.id === liveChannelId)?.name ?? "";

  const username = profile?.username ?? fallbackName;
  const name = profile ? displayNameOf(profile) : fallbackName;
  const roleCount = profile?.role_ids?.length ?? 0;

  // Высота зависит от ролей/игры: позицию считаем после рендера и прижимаем к окну.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const height = card.offsetHeight;
    const preferred = side === "left" ? anchor.left - CARD_WIDTH - GAP : anchor.right + GAP;
    const left = Math.min(Math.max(EDGE, preferred), window.innerWidth - CARD_WIDTH - EDGE);
    const top = Math.min(Math.max(EDGE, anchor.top), window.innerHeight - height - EDGE);
    setPosition({ top, left });
  }, [anchor, side, roleCount, game, liveChannelId]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [userId]);

  useEffect(() => {
    // Модалка, открытая уже поверх карточки (подтверждение админа), живёт в своём портале: клики и Esc в ней
    // карточку не закрывают. Модалки, в которых карточку открыли, не в счёте: клик мимо карточки её закрывает.
    const overlayOpen = () =>
      Array.from(document.querySelectorAll(DIALOG_SELECTOR)).some(
        (el) => el !== cardRef.current && !baselineDialogs.has(el),
      );
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !overlayOpen()) {
        onClose();
      }
    }
    function onPointer(event: PointerEvent) {
      const node = event.target;
      if (!(node instanceof Element)) {
        return;
      }
      // Клик по триггеру сам переключит карточку (toggleProfileCard); меню статуса живёт в своём портале.
      if (
        cardRef.current?.contains(node) ||
        node.closest(`[${PROFILE_TRIGGER_ATTR}]`) ||
        node.closest(`[${BACKDROP_ATTR}]`) ||
        node.closest('[role="menu"]')
      ) {
        return;
      }
      // Открыто меню статуса/ролей или модалка: клик мимо закрывает только их (подложка DOM-но не внутри карточки).
      if (document.querySelector('[role="menu"]') || overlayOpen()) {
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    // pointerdown в захвате: кнопки react-aria гасят pointerdown, и обычный mousedown до документа не доходит.
    document.addEventListener("pointerdown", onPointer, true);
    // Окно изменилось — якорь уехал. У шторки якоря нет, а resize на телефоне — это клавиатура и адресная строка.
    if (!sheet) window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, baselineDialogs, sheet]);

  const layer = openedInModal ? "z-[90]" : "z-50";

  const card = (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`Профиль: ${name}`}
      tabIndex={-1}
      className={cx(
        "animate-[ds-pop-in_0.15s_ease-out] border border-brand/60 bg-bg p-2 text-fg shadow-pop outline-none",
        sheet ? "relative mx-auto max-h-full w-full max-w-[340px] overflow-y-auto" : `fixed ${layer}`,
      )}
      style={
        sheet
          ? undefined
          : {
              width: CARD_WIDTH,
              top: position?.top ?? anchor.top,
              left: position?.left ?? anchor.left,
              visibility: position ? "visible" : "hidden",
            }
      }
    >
      <ProfileCardFrame
        skin={cosmetics?.frame}
        title={
          <Tooltip content={name} plain>
            <span className="block truncate">{name}</span>
          </Tooltip>
        }
        subtitle={showcase.title ? <ShowcaseTitle showcase={showcase} /> : null}
        overlay={showcase.badges.length > 0 ? <ShowcaseBadges showcase={showcase} /> : null}
        username={
          <Tooltip content={`@${username}`} plain>
            <span>@{username}</span>
          </Tooltip>
        }
        status={<StatusPlate status={status} selfPreference={selfPreference} onPresence={onPresence} />}
      >
        <ProfileCardWindow
          background={cosmetics?.background ?? null}
          character={cosmetics?.character ?? null}
          fallbackInitial={name.slice(0, 1).toUpperCase() || "?"}
        />
      </ProfileCardFrame>

      <div className="px-1.5 pb-1 pt-3">
        <RoleList userId={userId} username={username} isSelf={isSelf} roleTools={roleTools} />

        {liveChannelId != null ? (
          <LiveActivity channelId={liveChannelId} channelName={liveChannelName} isSelf={isSelf} onClose={onClose} />
        ) : null}

        {game ? <GameActivity game={game} /> : null}

        {isSelf ? (
          <Button
            variant="secondary"
            fullWidth
            className="mt-3"
            leadingIcon="edit"
            onPress={() => {
              onClose();
              onEditProfile();
            }}
          >
            Редактировать профиль
          </Button>
        ) : null}

        {/* Тач: ПКМ по участнику нет — действия (жалоба, модерация) отсюда. У владельца действий нет — меню было бы пустым. */}
        {!isSelf && isTouch && onOpenActions && profile && !profile.roles.includes("OWNER") ? (
          <Button
            variant="secondary"
            fullWidth
            className="mt-3"
            leadingIcon="more-h"
            onPress={() => {
              onClose();
              onOpenActions(userId);
            }}
          >
            Действия
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (!sheet) {
    return createPortal(card, document.body);
  }
  return createPortal(
    <div className={cx("fixed inset-0 flex items-end bg-black/60 px-2 pt-8 pb-[max(0.5rem,env(safe-area-inset-bottom))]", layer)}>
      <div {...{ [BACKDROP_ATTR]: "" }} className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      {card}
    </div>,
    document.body,
  );
}

/** Одна карточка на приложение: открывается из списка участников, чата и голосовых каналов. */
export function UserProfileCardHost({
  meId,
  roleTools,
  onEditProfile,
  onPresence,
  onOpenActions,
}: {
  meId: number | null;
  /** Передаётся только владельцу: управление ролями участника в карточке. */
  roleTools?: RoleTools;
  onEditProfile: () => void;
  onPresence: (next: PresencePreference) => void;
  /** Меню действий с участником (на сенсорном экране — кнопка «Действия» в карточке). */
  onOpenActions?: (userId: number) => void;
}) {
  const target = useProfileCardStore((s) => s.target);
  const close = useProfileCardStore((s) => s.close);
  if (!target) {
    return null;
  }
  return (
    <ProfileCard
      key={`${target.userId}:${target.anchor.top}:${target.anchor.left}`}
      target={target}
      isSelf={meId !== null && target.userId === meId}
      roleTools={roleTools}
      onClose={close}
      onEditProfile={onEditProfile}
      onPresence={onPresence}
      onOpenActions={onOpenActions}
    />
  );
}

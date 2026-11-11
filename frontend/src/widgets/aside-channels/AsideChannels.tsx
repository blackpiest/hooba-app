import { memo, useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { DndContext, PointerSensor, type DragEndEvent, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { deleteChannelApi, reorderChannelsApi, type ChannelDto } from "@/shared/api/channels";
import type { UserDirectoryEntry } from "@/shared/api/users";
import { formatApiError } from "@/shared/api/format-error";
import { getUserVolume, setUserVolume } from "@/shared/lib/voice-volume-prefs";
import { useIsTouch } from "@/hooks/use-breakpoint";
import { setChannelNotificationMuted, useMutedChannelIds } from "@/features/chat/chat-notification-prefs";
import { useUnreadChannelIds } from "@/features/chat/unread-channels";
import { connectVoiceChannel, leaveVoiceChannel } from "@/features/voice/voice-session";
import { requestJoinScreenShare } from "@/features/screenshare/screen-share-session";
import { useScreenShareStore } from "@/features/screenshare/screen-share-store";
import { requestVoiceModeration } from "@/shared/ws/app-realtime";
import { applyChannelTypeOrder, useChannelStore } from "@/stores/channel-store";
import { useDisplayName } from "@/stores/member-profile-store";
import { useUserStore } from "@/stores/user-store";
import { selectVoiceRoster, useVoiceMemberSpeaking, useVoiceStore } from "@/stores/voice-store";
import { isVoiceRoomClosedTo } from "@/stores/voice-room-capacity";
import { useVoiceRoomsStore } from "@/stores/voice-rooms-store";
import { ChannelItem } from "@/shared/ui/channel-item";
import { VoiceMember } from "@/shared/ui/voice-member";
import { Alert, Badge, ConfirmDialog } from "@/shared/ui";
import { toggleProfileCard } from "@/widgets/user-profile-card";
import { ChannelSettingsDialog } from "@/widgets/aside-channels/ChannelSettingsDialog";
import { ChannelContextMenu, type ChannelMenuAction, type ChannelMenuTarget } from "./ChannelContextMenu";
import { ChannelCue, ChannelGroup, VoiceOccupancy } from "./ChannelCues";
import { MemberContextMenu, type MemberMenuAction, type MemberMenuTarget } from "./MemberContextMenu";
import { MoveVoiceMemberDialog } from "./MoveVoiceMemberDialog";
import { ScreenShareJoinCard } from "./ScreenShareJoinCard";
import { SortableChannelBlock } from "./SortableChannelBlock";
import { restrictToVerticalAxis } from "./sortable-utils";
import { useReportStore } from "@/stores/report-store";
import { membersForVoiceChannel, voiceModerationErrorText } from "./voice-roster";

/** Подписан на речь одного участника: смена индикатора не перерисовывает весь сайдбар. */
function SpeakingVoiceMember({
  userId,
  meId,
  live,
  ...rest
}: Omit<ComponentProps<typeof VoiceMember>, "active"> & { userId: number; meId: number | null; live: boolean }) {
  const speaking = useVoiceMemberSpeaking(live ? userId : null, meId);
  const name = useDisplayName(userId, rest.name);
  return (
    <VoiceMember
      {...rest}
      name={name}
      userId={userId}
      active={speaking}
      onClick={(target) => toggleProfileCard(userId, rest.name, target, "right")}
    />
  );
}

interface AsideChannelsProps {
  className?: string;
  textChannels: ChannelDto[];
  voiceRooms: ChannelDto[];
  activeVoiceChannelId?: number;
  members: UserDirectoryEntry[];
  onChannelDeleted?: (channelId: number) => void;
  /** Открыть окно жалобы на участника (пункт «Пожаловаться» в меню голосовой комнаты). */
  onReportMember?: (member: UserDirectoryEntry, point: { x: number; y: number }) => void;
  /** Нажат текстовый канал — в т.ч. уже открытый (на телефоне вернуться из списка в чат). */
  onTextChannelOpen?: () => void;
}

/** Мемоизирован: оболочка перерисовывается от presence и прочего, сайдбару это не нужно. */
export const AsideChannels = memo(function AsideChannels({
  className,
  textChannels,
  voiceRooms,
  activeVoiceChannelId,
  members,
  onChannelDeleted,
  onReportMember,
  onTextChannelOpen,
}: AsideChannelsProps) {
  const navigate = useNavigate();
  const liveChannelId = useVoiceStore((s) => s.activeChannelId);
  const liveParticipants = useVoiceStore(selectVoiceRoster);
  const voiceRoomsByChannelId = useVoiceRoomsStore((s) => s.byChannelId);
  const isAdmin = useUserStore((s) => s.isAdmin);
  const dragHappenedRef = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  // Тач: перетаскивание выключено — иначе спорит с прокруткой списка и долгим нажатием (меню канала).
  const isTouch = useIsTouch();
  const canSort = isAdmin && !isTouch;
  const swallowDragClick = useCallback((event: { preventDefault: () => void }) => {
    if (!dragHappenedRef.current) {
      return false;
    }
    event.preventDefault();
    dragHappenedRef.current = false;
    return true;
  }, []);
  const suppressNextClick = useCallback(() => {
    dragHappenedRef.current = true;
    window.setTimeout(() => {
      dragHappenedRef.current = false;
    }, 0);
  }, []);
  const commitChannelOrder = useCallback((channelType: "TEXT" | "VOICE", items: ChannelDto[], event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = items.findIndex((channel) => channel.id === active.id);
    const newIndex = items.findIndex((channel) => channel.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const orderedIds = arrayMove(items, oldIndex, newIndex).map((channel) => channel.id);
    const { channels, setChannels } = useChannelStore.getState();
    setChannels(applyChannelTypeOrder(channels, channelType, orderedIds));
    void reorderChannelsApi(channelType, orderedIds).catch(() => {
      void useChannelStore.getState().fetchChannels({ force: true });
    });
  }, []);
  const unreadChannelIds = useUnreadChannelIds();
  const mutedChannelIds = useMutedChannelIds();
  const meId = useUserStore((s) => s.me?.id ?? null);
  const meUsername = useUserStore((s) => s.me?.username ?? null);
  const screenShareByChannelId = useVoiceRoomsStore((s) => s.screenShareByChannelId);
  const watchingChannelId = useScreenShareStore((s) => s.watchingChannelId);
  const hoverHideTimer = useRef<number | null>(null);
  const [hoverShare, setHoverShare] = useState<{
    channelId: number;
    username: string;
    top: number;
    left: number;
  } | null>(null);
  const clearHoverTimer = useCallback(() => {
    if (hoverHideTimer.current != null) {
      window.clearTimeout(hoverHideTimer.current);
      hoverHideTimer.current = null;
    }
  }, []);
  const scheduleHideHoverShare = useCallback(() => {
    clearHoverTimer();
    hoverHideTimer.current = window.setTimeout(() => setHoverShare(null), 150);
  }, [clearHoverTimer]);
  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);
  useEffect(() => {
    if (!hoverShare) {
      return;
    }
    const share = screenShareByChannelId[hoverShare.channelId];
    if (!share || share.user_id === meId || watchingChannelId === hoverShare.channelId) {
      setHoverShare(null);
    }
  }, [hoverShare, meId, screenShareByChannelId, watchingChannelId]);
  useEffect(() => {
    if (!hoverShare) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHoverShare(null);
      }
    }
    function onScroll() {
      setHoverShare(null);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [hoverShare]);
  const [memberMenu, setMemberMenu] = useState<MemberMenuTarget | null>(null);
  const [memberMenuError, setMemberMenuError] = useState<string | null>(null);
  const [memberMenuBusy, setMemberMenuBusy] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{
    userId: number;
    username: string;
    channelId: number;
  } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveBusyId, setMoveBusyId] = useState<number | null>(null);
  const [channelMenu, setChannelMenu] = useState<ChannelMenuTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; voice: boolean } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ channelType: "TEXT" | "VOICE"; channelId?: number } | null>(null);
  const closeChannelMenu = useCallback(() => setChannelMenu(null), []);
  const closeMemberMenu = useCallback(() => {
    setMemberMenu(null);
    setMemberMenuError(null);
    setMemberMenuBusy(false);
  }, []);

  const reportedIds = useReportStore((s) => s.reportedIds);
  /** Жалоба возможна, если участник есть в каталоге и не владелец (как в `MemberActions`). */
  function canReportUser(userId: number): boolean {
    const entry = members.find((member) => member.id === userId);
    return entry != null && !entry.roles.includes("OWNER");
  }

  async function runMemberModeration(event: "voice:server_mute" | "voice:kick", data: Record<string, unknown>) {
    setMemberMenuBusy(true);
    setMemberMenuError(null);
    const result = await requestVoiceModeration(event, data);
    setMemberMenuBusy(false);
    if (!result.ok) {
      setMemberMenuError(voiceModerationErrorText(result.code));
      return;
    }
    closeMemberMenu();
  }

  function onMemberMenuAction(action: MemberMenuAction) {
    if (!memberMenu) {
      return;
    }
    if (action === "mute") {
      void runMemberModeration("voice:server_mute", { user_id: memberMenu.userId, muted: !memberMenu.serverMuted });
    } else if (action === "kick") {
      void runMemberModeration("voice:kick", { user_id: memberMenu.userId });
    } else if (action === "report") {
      const entry = members.find((member) => member.id === memberMenu.userId);
      if (entry) {
        onReportMember?.(entry, { x: memberMenu.x, y: memberMenu.y });
      }
      closeMemberMenu();
    } else {
      setMoveError(null);
      setMoveBusyId(null);
      setMoveTarget({ userId: memberMenu.userId, username: memberMenu.username, channelId: memberMenu.channelId });
      closeMemberMenu();
    }
  }

  const openChannelMatch = useMatch("/app/channels/:channelId");
  const openChannelId = Number(openChannelMatch?.params.channelId);
  const alreadyInChannelMenu = channelMenu
    ? channelMenu.voice
      ? liveChannelId === channelMenu.id || activeVoiceChannelId === channelMenu.id
      : openChannelId === channelMenu.id
    : false;
  const menuRoomClosed =
    channelMenu?.voice === true &&
    isVoiceRoomClosedTo(
      meId,
      membersForVoiceChannel(
        channelMenu.id,
        voiceRoomsByChannelId[channelMenu.id],
        activeVoiceChannelId,
        liveChannelId,
        liveParticipants,
      ),
    );
  const showJoin = Boolean(channelMenu) && !alreadyInChannelMenu && !menuRoomClosed;
  const showLeave = Boolean(channelMenu?.voice) && alreadyInChannelMenu;

  function onChannelMenuAction(action: ChannelMenuAction) {
    if (!channelMenu) {
      return;
    }
    if (action === "mute") {
      setChannelNotificationMuted(channelMenu.id, !mutedChannelIds.includes(channelMenu.id));
    } else if (action === "join") {
      if (channelMenu.voice) {
        connectVoiceChannel(channelMenu.id);
      } else {
        navigate(`/app/channels/${channelMenu.id}`);
      }
    } else if (action === "leave") {
      leaveVoiceChannel();
    } else if (action === "edit") {
      setEditor({ channelType: channelMenu.voice ? "VOICE" : "TEXT", channelId: channelMenu.id });
    } else {
      setDeleteError(null);
      setDeleteTarget({ id: channelMenu.id, name: channelMenu.name, voice: channelMenu.voice });
    }
  }

  function rememberChannel(updated: ChannelDto) {
    const { channels, setChannels } = useChannelStore.getState();
    const exists = channels.some((channel) => channel.id === updated.id);
    setChannels(
      exists
        ? channels.map((channel) => (channel.id === updated.id ? { ...channel, ...updated } : channel))
        : [...channels, updated],
    );
    // Свежий список придёт по `channel:list_changed` — второй запрос здесь был бы дублем.
  }

  async function confirmDeleteChannel() {
    if (!deleteTarget || deleteBusy) {
      return;
    }
    const target = deleteTarget;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteChannelApi(target.id);
      onChannelDeleted?.(target.id);
      if (target.voice && activeVoiceChannelId === target.id) {
        leaveVoiceChannel();
      }
      if (!target.voice && openChannelId === target.id) {
        const next = textChannels.find((channel) => channel.id !== target.id);
        navigate(next ? `/app/channels/${next.id}` : "/app", { replace: true });
      }
      setDeleteTarget(null);
    } catch (error: unknown) {
      setDeleteError(error instanceof Error ? formatApiError(error.message) : "Не удалось удалить канал");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <aside className={["flex min-w-0 flex-col overflow-x-clip px-1.5 py-2", className].filter(Boolean).join(" ")}>
      <ChannelGroup title="Текстовые каналы" canAdd={isAdmin} onAdd={() => setEditor({ channelType: "TEXT" })}>
        <DndContext
          sensors={canSort ? sensors : []}
          modifiers={[restrictToVerticalAxis]}
          autoScroll={{ threshold: { x: 0, y: 0.2 } }}
          onDragEnd={(event) => {
            suppressNextClick();
            if (isAdmin) {
              commitChannelOrder("TEXT", textChannels, event);
            }
          }}
        >
          <SortableContext items={textChannels.map((channel) => channel.id)} strategy={verticalListSortingStrategy}>
            <nav className="flex flex-col">
              {textChannels.map((channel) => (
                <SortableChannelBlock key={channel.id} id={channel.id} disabled={!canSort}>
                  {(handle) => (
                    <ChannelItem
                      ref={handle.ref}
                      dragListeners={handle.listeners}
                      dragAttributes={handle.attributes}
                      swallowDragClick={canSort ? swallowDragClick : undefined}
                      icon="hash"
                      label={channel.name}
                      id={channel.id.toString()}
                      locked={channel.is_private}
                      unread={unreadChannelIds.includes(channel.id)}
                      onNavigate={() => {
                        const screen = useScreenShareStore.getState();
                        if (screen.watchingChannelId != null || screen.hostView === "stage") {
                          screen.collapseToPip();
                        }
                        onTextChannelOpen?.();
                      }}
                      trailing={
                        <ChannelCue
                          muted={mutedChannelIds.includes(channel.id)}
                          unread={unreadChannelIds.includes(channel.id)}
                        />
                      }
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setChannelMenu({
                          x: event.clientX,
                          y: event.clientY,
                          id: channel.id,
                          name: channel.name,
                          voice: false,
                        });
                      }}
                    />
                  )}
                </SortableChannelBlock>
              ))}
            </nav>
          </SortableContext>
        </DndContext>
      </ChannelGroup>

      <ChannelGroup title="Голосовые каналы" canAdd={isAdmin} onAdd={() => setEditor({ channelType: "VOICE" })}>
        <DndContext
          sensors={canSort ? sensors : []}
          modifiers={[restrictToVerticalAxis]}
          autoScroll={{ threshold: { x: 0, y: 0.2 } }}
          onDragEnd={(event) => {
            suppressNextClick();
            if (isAdmin) {
              commitChannelOrder("VOICE", voiceRooms, event);
            }
          }}
        >
          <SortableContext items={voiceRooms.map((room) => room.id)} strategy={verticalListSortingStrategy}>
            <nav className="flex flex-col">
              {voiceRooms.map((room) => {
                const roomMembers = membersForVoiceChannel(
                  room.id,
                  voiceRoomsByChannelId[room.id],
                  activeVoiceChannelId,
                  liveChannelId,
                  liveParticipants,
                );
                const sittingHere = activeVoiceChannelId === room.id || liveChannelId === room.id;
                const roomClosed = !sittingHere && isVoiceRoomClosedTo(meId, roomMembers);

                return (
                  <SortableChannelBlock key={room.id} id={room.id} disabled={!canSort}>
                    {(handle) => (
                      <>
                        <ChannelItem
                          ref={handle.ref}
                          dragListeners={handle.listeners}
                          dragAttributes={handle.attributes}
                          swallowDragClick={canSort ? swallowDragClick : undefined}
                          icon="speaker"
                          label={room.name}
                          id={room.id.toString()}
                          active={activeVoiceChannelId === room.id}
                          blocked={roomClosed}
                          locked={room.is_private}
                          trailing={<VoiceOccupancy count={roomMembers.length} />}
                          onClick={() => connectVoiceChannel(room.id)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setMemberMenu(null);
                            setChannelMenu({
                              x: event.clientX,
                              y: event.clientY,
                              id: room.id,
                              name: room.name,
                              voice: true,
                            });
                          }}
                        />
                        {roomMembers.map((member) => {
                          const share = screenShareByChannelId[room.id];
                          const isHost = share != null && member.user_id === share.user_id;
                          const canJoin = isHost && meId !== member.user_id && watchingChannelId !== room.id;
                          return (
                            <SpeakingVoiceMember
                              key={member.user_id}
                              userId={member.user_id}
                              meId={meId}
                              live={member.live}
                              name={member.username}
                              initials={member.username[0]?.toUpperCase() ?? "?"}
                              muted={member.muted}
                              deafened={member.deafened}
                              trailing={isHost ? <Badge variant="live">LIVE</Badge> : undefined}
                              onMouseEnter={
                                canJoin && !isTouch
                                  ? (event) => {
                                      clearHoverTimer();
                                      const rect = event.currentTarget.getBoundingClientRect();
                                      setHoverShare({
                                        channelId: room.id,
                                        username: member.username,
                                        top: rect.top,
                                        left: rect.right + 8,
                                      });
                                    }
                                  : undefined
                              }
                              onMouseLeave={canJoin && !isTouch ? scheduleHideHoverShare : undefined}
                              onContextMenu={(event) => {
                                const isSelf = meId !== null && member.user_id === meId;
                                if (isSelf) {
                                  setMemberMenu(null);
                                  setChannelMenu(null);
                                  return;
                                }
                                setChannelMenu(null);
                                setMemberMenuError(null);
                                // Пустое меню не показываем: без прав, без громкости и без «Пожаловаться» (владелец).
                                if (!isAdmin && liveChannelId !== room.id && !canReportUser(member.user_id)) {
                                  setMemberMenu(null);
                                  return;
                                }
                                setMemberMenu({
                                  x: event.clientX,
                                  y: event.clientY,
                                  userId: member.user_id,
                                  username: member.username,
                                  channelId: room.id,
                                  volume: getUserVolume(member.user_id),
                                  serverMuted: member.server_muted === true,
                                });
                              }}
                            />
                          );
                        })}
                      </>
                    )}
                  </SortableChannelBlock>
                );
              })}
            </nav>
          </SortableContext>
        </DndContext>
      </ChannelGroup>

      {memberMenu ? (
        <MemberContextMenu
          target={memberMenu}
          isAdmin={isAdmin}
          canAdjustVolume={liveChannelId === memberMenu.channelId}
          canReport={canReportUser(memberMenu.userId)}
          reported={reportedIds.has(memberMenu.userId)}
          busy={memberMenuBusy}
          error={memberMenuError}
          onClose={closeMemberMenu}
          onVolume={(volume) => {
            setUserVolume(memberMenu.userId, volume);
            setMemberMenu((current) => (current ? { ...current, volume } : current));
          }}
          onAction={onMemberMenuAction}
        />
      ) : null}
      {hoverShare ? (
        <ScreenShareJoinCard
          username={hoverShare.username}
          top={hoverShare.top}
          left={hoverShare.left}
          onPointerEnter={clearHoverTimer}
          onPointerLeave={scheduleHideHoverShare}
          onJoin={() => {
            const channelId = hoverShare.channelId;
            setHoverShare(null);
            requestJoinScreenShare(channelId);
          }}
        />
      ) : null}
      {channelMenu && (isAdmin || showJoin || showLeave || !channelMenu.voice) ? (
        <ChannelContextMenu
          target={channelMenu}
          notificationsMuted={mutedChannelIds.includes(channelMenu.id)}
          showJoin={showJoin}
          showLeave={showLeave}
          isAdmin={isAdmin}
          onClose={closeChannelMenu}
          onAction={onChannelMenuAction}
        />
      ) : null}
      {moveTarget ? (
        <MoveVoiceMemberDialog
          username={moveTarget.username}
          rooms={voiceRooms.filter((room) => room.id !== moveTarget.channelId)}
          occupancy={(channelId) =>
            membersForVoiceChannel(
              channelId,
              voiceRoomsByChannelId[channelId],
              activeVoiceChannelId,
              liveChannelId,
              liveParticipants,
            ).length
          }
          busyId={moveBusyId}
          error={moveError}
          onClose={() => {
            setMoveTarget(null);
            setMoveError(null);
          }}
          onPick={(channelId) => {
            void (async () => {
              setMoveBusyId(channelId);
              setMoveError(null);
              const result = await requestVoiceModeration("voice:move", {
                user_id: moveTarget.userId,
                channel_id: channelId,
              });
              setMoveBusyId(null);
              if (!result.ok) {
                setMoveError(voiceModerationErrorText(result.code));
                return;
              }
              setMoveTarget(null);
            })();
          }}
        />
      ) : null}
      {editor ? (
        <ChannelSettingsDialog
          channelType={editor.channelType}
          channelId={editor.channelId}
          members={members}
          meId={meId}
          meUsername={meUsername}
          onClose={() => setEditor(null)}
          onSaved={(channel) => {
            rememberChannel(channel);
            setEditor(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          void confirmDeleteChannel();
        }}
        tone="danger"
        title="Удалить канал"
        description={
          <div className="flex flex-col gap-3">
            <span>Действительно удалить канал «{deleteTarget?.name}»?</span>
            {deleteError ? (
              <Alert tone="danger" compact>
                {deleteError}
              </Alert>
            ) : null}
          </div>
        }
        confirmLabel="Удалить"
        isPending={deleteBusy}
      />
    </aside>
  );
});

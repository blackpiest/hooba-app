import {
  useCallback,
  type DragEvent as ReactDragEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { AppShellOutletContext } from "./AppShellLayout";
import { fetchChannelById, type ChannelDto } from "@/shared/api/channels";
import { formatApiError } from "@/shared/api/format-error";
import {
  fetchChannelMessages,
  fetchChannelPin,
  pinMessage,
  setMessageReaction,
  unpinChannel,
  type ChannelPinDto,
  type MessageDto,
  type MessageReactionsDto,
} from "@/shared/api/messages";
import {
  applyMessageReactions,
  dropCustomEmojiReactions,
  toggleReaction,
} from "@/features/chat/reactions/reaction-state";
import type { AttachmentDto } from "@/shared/api/attachments";
import { ComposerNotice } from "@/features/chat/ComposerNotice";
import {
  applyIncomingMessage,
  applyMessageAck,
  dropDeliveredTemps,
  isTempRow,
  markTempFailed,
  mergeInitialHistory,
  mergeOlderPage,
  mergeRefreshedHistory,
  oldestPersistentMessage,
  type ChatRow,
  type TempMessageRow,
} from "@/features/chat/message-history";
import { getSessionEpoch } from "@/shared/lib/session-reset";
import {
  joinRealtimeChannel,
  sendChatMessage,
  sendDeleteMessage,
  sendEditMessage,
  subscribeRealtime,
} from "@/shared/ws/app-realtime";
import { connectVoiceChannel } from "@/features/voice/voice-session";
import { useChannelStore } from "@/stores/channel-store";
import {
  canonicalMessageContent,
  displayMessageContent,
  MESSAGE_CONTENT_LIMIT,
} from "@/features/chat/message-content";
import { randomClientId } from "@/shared/lib/random-client-id";
import { openExternalHttps } from "@/shared/ui/message-text/https-links";
import { Alert, EmptyState, IconButton, Slime, Spinner, Tooltip, Topbar, toast } from "@/shared/ui";
import { ChatComposer, type ComposerAttachApi } from "./channel-view/ChatComposer";
import { DeleteMessageDialog, DropOverlay, ExternalLinkDialog } from "./channel-view/ChannelDialogs";
import { MessageRow, type Moderator } from "./channel-view/MessageRow";
import { PinnedMessageBar } from "./channel-view/PinnedMessageBar";
import { sameLocalDay } from "./channel-view/message-format";

const MESSAGE_PAGE_SIZE = 50;
/** Догрузка истории до закреплённого сообщения: не больше стольких страниц за раз. */
const PIN_JUMP_MAX_PAGES = 40;
const LOAD_OLDER_SCROLL_THRESHOLD_PX = 80;
const JUMP_TO_LATEST_THRESHOLD_PX = 360;
/** Без ack дольше этого сообщение помечается неотправленным. */
const MESSAGE_ACK_TIMEOUT_MS = 15_000;

export function ChannelViewPage() {
  const navigate = useNavigate();
  const { me, membersOpen, toggleMembers, openChannels } = useOutletContext<AppShellOutletContext>();
  const { channelId } = useParams();

  const id = Number(channelId);
  const invalidId = !Number.isFinite(id);
  const meId = me?.id ?? null;

  const channels = useChannelStore((s) => s.channels);
  const channelsLoaded = useChannelStore((s) => s.loaded);
  // Список каналов к показу экрана уже загружен: берём канал из него сразу, без мелькания спиннера до fetchChannelById.
  const [ch, setCh] = useState<ChannelDto | null>(
    () => useChannelStore.getState().channels.find((channel) => channel.id === id) ?? null,
  );
  // Права канала — из списка каналов: он перечитывается по `channel:list_changed` и смене ролей.
  const listedPermissions = channels.find((channel) => channel.id === id)?.my_permissions;
  const canSend =
    (listedPermissions ?? ch?.my_permissions)?.send_messages ?? me?.permissions?.send_messages !== false;
  /** Чужие сообщения: владелец — любые, админ — кроме сообщений владельца и админов (сервер проверяет так же). */
  const moderator: Moderator = me?.roles.includes("OWNER") ? "owner" : me?.roles.includes("ADMIN") ? "admin" : null;
  const [pendingDelete, setPendingDelete] = useState<MessageDto | null>(null);
  /** Закреп текущего канала; чужой `channel_id` — ещё не перезагружен после смены канала. */
  const [pin, setPin] = useState<ChannelPinDto | null>(null);
  const canReact = (listedPermissions ?? ch?.my_permissions)?.react ?? true;
  const canAttach =
    canSend &&
    ((listedPermissions ?? ch?.my_permissions)?.attach_files ?? me?.permissions?.attach_files !== false);

  const chId = ch?.id;
  const chType = ch?.channel_type;

  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  /** Растёт после восстановления сокета: последняя страница перезапрашивается, чтобы закрыть пропуск. */
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [wsErr, setWsErr] = useState<string | null>(null);
  const [olderErr, setOlderErr] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [pendingExternalUrl, setPendingExternalUrl] = useState<string | null>(null);
  /** Composer регистрирует сюда приём файлов: drag&drop ловится на всей области канала. */
  const attachApiRef = useRef<ComposerAttachApi | null>(null);
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  // Файл, брошенный мимо зоны, браузер открыл бы вместо приложения.
  useEffect(() => {
    const guard = (event: DragEvent) => {
      if (event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files")) {
        event.preventDefault();
      }
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);

  const showAttachError = useCallback((code: string) => setWsErr(code), []);
  const clearWsErr = useCallback(() => setWsErr(null), []);
  const requestDelete = useCallback((message: MessageDto) => setPendingDelete(message), []);
  const togglePin = useCallback((message: MessageDto, pinned: boolean) => {
    const request = pinned ? unpinChannel(message.channel_id) : pinMessage(message.id);
    request.then(setPin).catch((e: unknown) => {
      toast.error(
        pinned ? "Не удалось открепить" : "Не удалось закрепить",
        e instanceof Error ? formatApiError(e.message) : undefined,
      );
    });
  }, []);

  const listRef = useRef<HTMLDivElement>(null);
  const voiceRedirectedRef = useRef(false);
  const shouldScrollToBottomRef = useRef(false);
  const jumpToLatestVisibleRef = useRef(false);
  const [jumpToLatestVisible, setJumpToLatestVisible] = useState(false);
  /** Канал, чья история уже загружена в `rows`. `null` — идёт первая загрузка. */
  const loadedChannelRef = useRef<number | null>(null);
  const activeChannelIdRef = useRef(id);
  const loadingOlderRef = useRef(false);
  const meIdRef = useRef(meId);
  useLayoutEffect(() => {
    activeChannelIdRef.current = id;
    meIdRef.current = meId;
  });

  /** Оптимистично; ответ сервера (и `message:reactions` у всех) приносит точный список. */
  const toggleMessageReaction = useCallback((message: MessageDto, emoji: string, on: boolean) => {
    const viewer = meIdRef.current;
    if (viewer === null) {
      return;
    }
    const patchLocal = (add: boolean) =>
      setRows((prev) => {
        const row = prev.find((item) => !isTempRow(item) && item.id === message.id);
        return row && !isTempRow(row)
          ? applyMessageReactions(prev, message.id, toggleReaction(row.reactions ?? [], emoji, viewer, add))
          : prev;
      });
    patchLocal(on);
    setMessageReaction(message.id, emoji, on)
      .then((result) => setRows((prev) => applyMessageReactions(prev, result.message_id, result.reactions)))
      .catch((e: unknown) => {
        patchLocal(!on);
        toast.error("Не удалось изменить реакцию", e instanceof Error ? formatApiError(e.message) : undefined);
      });
  }, []);

  const syncJumpToLatest = useCallback((list: HTMLElement) => {
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const next = distanceFromBottom > JUMP_TO_LATEST_THRESHOLD_PX;
    if (next === jumpToLatestVisibleRef.current) {
      return;
    }
    jumpToLatestVisibleRef.current = next;
    setJumpToLatestVisible(next);
  }, []);

  useEffect(() => {
    if (invalidId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const row = await fetchChannelById(id);
        const listed = useChannelStore.getState().channels.find((channel) => channel.id === id);
        const next =
          listed && listed.updated_at > row.updated_at
            ? { ...row, name: listed.name, updated_at: listed.updated_at }
            : row;

        if (!cancelled) {
          setCh(next);

          setErr(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setCh(null);

          setErr(e instanceof Error ? formatApiError(e.message) : "Ошибка");
        }
      }
    })();

    return () => {
      cancelled = true;

      voiceRedirectedRef.current = false;
    };
  }, [id, invalidId]);

  useEffect(() => {
    if (invalidId || !channelsLoaded) {
      return;
    }
    const listed = channels.find((channel) => channel.id === id);
    if (!listed) {
      const next = channels.find((channel) => channel.channel_type === "TEXT");
      navigate(next ? `/app/channels/${next.id}` : "/app", { replace: true });
      return;
    }
    setCh((current) => {
      if (!current || current.id !== id) {
        return current;
      }
      if (
        current.name === listed.name &&
        current.is_private === listed.is_private &&
        current.updated_at === listed.updated_at
      ) {
        return current;
      }
      return {
        ...current,
        name: listed.name,
        is_private: listed.is_private,
        updated_at: listed.updated_at,
      };
    });
  }, [channels, channelsLoaded, id, invalidId, navigate]);

  /** Прямой URL на голосовой канал: подключиться фоново и открыть текстовый чат. */

  useEffect(() => {
    if (!ch || ch.channel_type !== "VOICE" || voiceRedirectedRef.current) {
      return;
    }
    if (channelsLoaded && !channels.some((channel) => channel.id === ch.id)) {
      return;
    }

    voiceRedirectedRef.current = true;

    connectVoiceChannel(ch.id);

    const textChannel =
      channels.find((c) => c.channel_type === "TEXT") ??
      channels.find((c) => c.channel_type !== "VOICE");

    if (textChannel && textChannel.id !== ch.id) {
      navigate(`/app/channels/${textChannel.id}`, { replace: true });
    }
  }, [ch, channels, channelsLoaded, navigate]);

  useEffect(() => {
    if (invalidId || chId !== id || chId === undefined || chType !== "TEXT") {
      return;
    }

    // Тот же канал уже загружен — это догрузка после реконнекта: экран не сбрасываем.
    const refresh = loadedChannelRef.current === id;
    let cancelled = false;
    const sessionEpoch = getSessionEpoch();
    if (!refresh) {
      loadedChannelRef.current = null;
      // Строки прошлого канала не должны мелькать под новым заголовком и давать курсор пагинации.
      setRows((prev) => {
        const kept = prev.filter((row) => row.channel_id === id);
        return kept.length === prev.length ? prev : kept;
      });
      setHasOlderMessages(false);
      setOlderErr(null);
      setHistoryReady(false);
      jumpToLatestVisibleRef.current = false;
      setJumpToLatestVisible(false);
      setPendingExternalUrl(null);
    }

    void (async () => {
      try {
        const list = await fetchChannelMessages(id, 0, MESSAGE_PAGE_SIZE);

        if (cancelled || sessionEpoch !== getSessionEpoch()) {
          return;
        }
        const full = list.length === MESSAGE_PAGE_SIZE;
        if (refresh) {
          const view = listRef.current;
          if (view && view.scrollHeight - view.scrollTop - view.clientHeight < LOAD_OLDER_SCROLL_THRESHOLD_PX) {
            shouldScrollToBottomRef.current = true;
          }
          setRows((prev) =>
            dropDeliveredTemps(
              mergeRefreshedHistory(
                prev.filter((row) => row.channel_id === id),
                list,
                full,
              ).rows,
              list,
              meIdRef.current,
            ),
          );
          // При разрыве старое выброшено и его надо догрузить; при стыковке лишний запрос вверх просто вернёт пусто.
          if (full) {
            setHasOlderMessages(true);
          }
          return;
        }

        setRows((prev) =>
          dropDeliveredTemps(
            mergeInitialHistory(
              prev.filter((row) => row.channel_id === id),
              list,
            ),
            list,
            meIdRef.current,
          ),
        );

        setHasOlderMessages(full);

        setOlderErr(null);

        shouldScrollToBottomRef.current = true;
        loadedChannelRef.current = id;
      } catch (e: unknown) {
        if (cancelled || sessionEpoch !== getSessionEpoch() || refresh) {
          // Неудачная догрузка оставляет то, что уже на экране; следующий реконнект попробует снова.
          return;
        }
        setRows([]);

        setHasOlderMessages(false);

        setErr(e instanceof Error ? formatApiError(e.message, "Ошибка загрузки сообщений") : "Ошибка загрузки сообщений");
      } finally {
        if (!cancelled && sessionEpoch === getSessionEpoch() && !refresh) {
          setHistoryReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, invalidId, chId, chType, historyRefresh]);

  useEffect(() => {
    if (invalidId || chId !== id || chId === undefined || chType !== "TEXT") {
      return;
    }
    let cancelled = false;
    fetchChannelPin(id)
      .then((next) => {
        if (!cancelled) {
          setPin(next);
        }
      })
      .catch(() => {
        // Без закрепа чат работает; следующий реконнект попробует снова.
      });
    return () => {
      cancelled = true;
    };
  }, [id, invalidId, chId, chType, historyRefresh]);

  useEffect(() => {
    if (invalidId || chId !== id || chId === undefined || chType !== "TEXT") {
      return;
    }

    joinRealtimeChannel(id);
    let wentOffline = false;

    const unsub = subscribeRealtime((event, data) => {
      if (event === "connection:status") {
        if (data.state === "reconnecting") {
          wentOffline = true;
          // Ack на старом сокете уже не придёт.
          setRows((prev) => markTempFailed(prev, null));
        } else if (data.state === "online" && wentOffline) {
          wentOffline = false;
          setHistoryRefresh((n) => n + 1);
        }
        return;
      }

      if (event === "auth:success" || event === "auth:identified") {
        setWsErr(null);

        joinRealtimeChannel(id);

        return;
      }

      if (event === "message:new") {
        const msg = data.message as MessageDto | undefined;

        if (!msg || msg.channel_id !== id) {
          return;
        }

        const list = listRef.current;
        if (
          list &&
          list.scrollHeight - list.scrollTop - list.clientHeight <
            LOAD_OLDER_SCROLL_THRESHOLD_PX
        ) {
          shouldScrollToBottomRef.current = true;
        }

        setRows((prev) => applyIncomingMessage(prev, msg));

        return;
      }

      if (event === "message:ack") {
        const ack = data as {
          temp_id?: string;
          tempId?: string;
          success: boolean;
          real_message?: MessageDto;
          realMessage?: MessageDto;
          error_code?: string;
          errorCode?: string;
        };

        const tempId = ack.temp_id ?? ack.tempId ?? "";

        if (!ack.success) {
          setWsErr(ack.error_code ?? ack.errorCode ?? "SEND_FAILED");

          setRows((prev) =>
            prev.filter((r) => !isTempRow(r) || r.tempId !== tempId)
          );

          return;
        }

        const real = ack.real_message ?? ack.realMessage;

        if (!real) {
          return;
        }

        setRows((prev) => applyMessageAck(prev, tempId, real));

        setWsErr(null);

        return;
      }

      if (event === "message:reactions") {
        const update = data as Partial<MessageReactionsDto>;
        if (update.channel_id !== id || typeof update.message_id !== "number" || !Array.isArray(update.reactions)) {
          return;
        }
        const { message_id: messageId, reactions } = update;
        setRows((prev) => applyMessageReactions(prev, messageId, reactions));
        setPin((current) =>
          current?.message?.id === messageId ? { ...current, message: { ...current.message, reactions } } : current,
        );
        return;
      }

      if (event === "emoji:list_changed") {
        const deletedId = data.deleted_id;
        if (typeof deletedId !== "number") {
          return;
        }
        setRows((prev) => dropCustomEmojiReactions(prev, deletedId));
        setPin((current) =>
          current?.message?.reactions?.some((reaction) => reaction.custom_emoji_id === deletedId)
            ? {
                ...current,
                message: {
                  ...current.message,
                  reactions: current.message.reactions.filter((reaction) => reaction.custom_emoji_id !== deletedId),
                },
              }
            : current,
        );
        return;
      }

      if (event === "message:edited") {
        const msg = data.message as MessageDto | undefined;
        if (!msg || msg.channel_id !== id) {
          return;
        }
        setRows((prev) =>
          prev.map((row) => (!isTempRow(row) && row.id === msg.id ? msg : row)),
        );
        setPin((current) => (current?.message?.id === msg.id ? { ...current, message: msg } : current));
        setEditingId((current) => (current === msg.id ? null : current));
        setWsErr(null);
        return;
      }

      if (event === "message:deleted") {
        const messageId = Number(data.message_id);
        const channelId = Number(data.channel_id);
        if (!Number.isFinite(messageId) || channelId !== id) {
          return;
        }
        setRows((prev) => prev.filter((row) => isTempRow(row) || row.id !== messageId));
        setPin((current) => (current?.message?.id === messageId ? { ...current, message: null } : current));
        setEditingId((current) => (current === messageId ? null : current));
        setWsErr(null);
        return;
      }

      if (event === "channel:pin") {
        if (Number(data.channel_id) === id) {
          setPin(data as ChannelPinDto);
        }
        return;
      }

      if (event === "message:error") {
        const code = typeof data.code === "string" ? data.code : "UNKNOWN";
        setWsErr(code);
        return;
      }

      if (event === "error") {
        const code = typeof data.code === "string" ? data.code : "UNKNOWN";

        setWsErr(code);
      }
    });

    return () => {
      unsub();

      joinRealtimeChannel(null);
    };
  }, [id, invalidId, chId, chType]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    if (shouldScrollToBottomRef.current) {
      shouldScrollToBottomRef.current = false;
      list.scrollTo({ top: list.scrollHeight });
    }

    syncJumpToLatest(list);
  }, [rows, syncJumpToLatest]);

  const loadOlderMessages = useCallback(async () => {
    const list = listRef.current;

    // Ref, а не state: два scroll подряд до перерисовки иначе шлют одинаковый запрос дважды.
    if (
      !list ||
      loadingOlderRef.current ||
      !hasOlderMessages ||
      invalidId ||
      chType !== "TEXT" ||
      loadedChannelRef.current !== id
    ) {
      return;
    }

    const cursor = oldestPersistentMessage(rows);
    if (!cursor || cursor.channel_id !== id) {
      return;
    }

    const previousScrollHeight = list.scrollHeight;
    const previousScrollTop = list.scrollTop;

    loadingOlderRef.current = true;
    setIsLoadingOlder(true);

    try {
      const sessionEpoch = getSessionEpoch();
      const olderMessages = await fetchChannelMessages(id, 0, MESSAGE_PAGE_SIZE, {
        createdAt: cursor.created_at,
        id: cursor.id,
      });
      // Пока шёл запрос, пользователь мог уйти в другой канал: чужая страница туда не попадает.
      if (sessionEpoch !== getSessionEpoch() || activeChannelIdRef.current !== id) {
        return;
      }

      setHasOlderMessages(olderMessages.length === MESSAGE_PAGE_SIZE);

      setRows((prev) => mergeOlderPage(prev, olderMessages));

      setOlderErr(null);

      requestAnimationFrame(() => {
        const currentList = listRef.current;

        if (!currentList) {
          return;
        }

        currentList.scrollTop =
          currentList.scrollHeight - previousScrollHeight + previousScrollTop;
      });
    } catch (e: unknown) {
      if (activeChannelIdRef.current !== id) {
        return;
      }
      setOlderErr(
        e instanceof Error
          ? formatApiError(e.message, "Ошибка загрузки старых сообщений")
          : "Ошибка загрузки старых сообщений",
      );
    } finally {
      loadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [chType, hasOlderMessages, id, invalidId, rows]);

  const handleMessageListScroll = useCallback(() => {
    const list = listRef.current;

    if (!list) {
      return;
    }

    syncJumpToLatest(list);

    if (list.scrollTop > LOAD_OLDER_SCROLL_THRESHOLD_PX) {
      return;
    }

    void loadOlderMessages();
  }, [loadOlderMessages, syncJumpToLatest]);

  const scrollChatToLatest = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, []);

  const pinnedMessage = pin?.channel_id === id ? pin.message : null;
  const pinnedId = pinnedMessage?.id;
  const pinnedLoaded = pinnedId !== undefined && rows.some((row) => !isTempRow(row) && row.id === pinnedId);
  const [pinJumpLoading, setPinJumpLoading] = useState(false);
  /** Сообщение, к которому прокрутить, как только оно появится в ленте (после догрузки истории). */
  const pendingPinJumpRef = useRef<number | null>(null);

  const scrollToMessage = useCallback((messageId: number): boolean => {
    const target = listRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.animate(
      [{ backgroundColor: "color-mix(in srgb, var(--color-accent) 18%, transparent)" }, { backgroundColor: "transparent" }],
      { duration: 1600, easing: "ease-out" },
    );
    return true;
  }, []);

  useLayoutEffect(() => {
    const pending = pendingPinJumpRef.current;
    if (pending !== null && scrollToMessage(pending)) {
      pendingPinJumpRef.current = null;
    }
  }, [rows, scrollToMessage]);

  /** Закреплённое не в ленте — догружаем историю вверх страницами, пока не найдём, и прокручиваем к нему. */
  const jumpToPinned = useCallback(async () => {
    if (!pinnedMessage || loadingOlderRef.current) {
      return;
    }
    if (pinnedLoaded) {
      scrollToMessage(pinnedMessage.id);
      return;
    }
    let cursor = oldestPersistentMessage(rows);
    if (!cursor || cursor.channel_id !== id || loadedChannelRef.current !== id || !hasOlderMessages) {
      return;
    }

    loadingOlderRef.current = true;
    setPinJumpLoading(true);
    const sessionEpoch = getSessionEpoch();
    const target = pinnedMessage;
    let loaded: MessageDto[] = [];
    let hasMore = true;
    let found = false;
    try {
      for (let page = 0; page < PIN_JUMP_MAX_PAGES && hasMore && !found; page += 1) {
        const older = await fetchChannelMessages(id, 0, MESSAGE_PAGE_SIZE, {
          createdAt: cursor.created_at,
          id: cursor.id,
        });
        if (sessionEpoch !== getSessionEpoch() || activeChannelIdRef.current !== id) {
          return;
        }
        loaded = [...older, ...loaded];
        hasMore = older.length === MESSAGE_PAGE_SIZE;
        found = older.some((message) => message.id === target.id);
        if (older.length > 0) {
          cursor = older[0];
        }
      }
      setHasOlderMessages(hasMore);
      if (loaded.length > 0) {
        if (found) {
          pendingPinJumpRef.current = target.id;
        }
        setRows((prev) => mergeOlderPage(prev, loaded));
      }
      setOlderErr(null);
      if (!found) {
        toast.info("Не удалось найти закреплённое сообщение в истории");
      }
    } catch (e: unknown) {
      if (activeChannelIdRef.current === id) {
        toast.error(
          "Не удалось загрузить историю",
          e instanceof Error ? formatApiError(e.message) : undefined,
        );
      }
    } finally {
      loadingOlderRef.current = false;
      setPinJumpLoading(false);
    }
  }, [hasOlderMessages, id, pinnedLoaded, pinnedMessage, rows, scrollToMessage]);

  const sendMessage = useCallback(
    (text: string, attachments: AttachmentDto[] = []) => {
      if (chType !== "TEXT") {
        return;
      }

      const tempId = randomClientId();
      const now = new Date().toISOString();

      const meRow: TempMessageRow = {
        tempId,
        id: `t:${tempId}`,
        channel_id: id,
        author_id: meId ?? -1,
        author_username: "Вы",
        content: text,
        attachments,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      };

      const sent = sendChatMessage(
        id,
        tempId,
        text,
        attachments.map((item) => item.id),
      );

      setRows((prev) => [...prev, sent ? meRow : { ...meRow, failed: true }]);

      shouldScrollToBottomRef.current = true;

      if (sent) {
        window.setTimeout(() => {
          setRows((prev) => markTempFailed(prev, tempId));
        }, MESSAGE_ACK_TIMEOUT_MS);
      }
    },
    [chType, id, meId],
  );

  const retryMessage = useCallback(
    (row: TempMessageRow) => {
      setRows((prev) => prev.filter((r) => !isTempRow(r) || r.tempId !== row.tempId));
      sendMessage(row.content, row.attachments);
    },
    [sendMessage],
  );

  const discardMessage = useCallback((tempId: string) => {
    setRows((prev) => prev.filter((r) => !isTempRow(r) || r.tempId !== tempId));
  }, []);

  const startEdit = useCallback((row: MessageDto) => {
    setEditingId(row.id);
    setEditDraft(displayMessageContent(row.content));
    setWsErr(null);
  }, []);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const saveEdit = useCallback(() => {
    const text = canonicalMessageContent(editDraft);
    if (editingId === null) {
      return;
    }
    if (!text) {
      // Текст сообщения с картинками можно стереть — останутся картинки.
      const row = rows.find((item) => !isTempRow(item) && item.id === editingId);
      if (!row?.attachments?.some((item) => !item.purged)) {
        setWsErr("MESSAGE_EMPTY");
        return;
      }
    }
    if (text.length > MESSAGE_CONTENT_LIMIT) {
      return;
    }
    sendEditMessage(editingId, text);
  }, [editDraft, editingId, rows]);

  const onDragEnter = useCallback((event: ReactDragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }, []);

  const onDragOver = useCallback(
    (event: ReactDragEvent) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = canAttach ? "copy" : "none";
    },
    [canAttach],
  );

  const onDragLeave = useCallback((event: ReactDragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) {
      return;
    }
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  }, []);

  const onDrop = useCallback(
    (event: ReactDragEvent) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) {
        return;
      }
      if (!canAttach || !attachApiRef.current) {
        setWsErr(canSend ? "ATTACH_FORBIDDEN" : "SEND_FORBIDDEN");
        return;
      }
      attachApiRef.current.addFiles(files);
    },
    [canAttach, canSend],
  );

  if (invalidId) {
    return (
      <div className="p-6">
        <Alert tone="danger">Некорректный id канала</Alert>
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-6">
        <Alert tone="danger">{err}</Alert>
      </div>
    );
  }

  if (!ch) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Spinner size="lg" />
      </div>
    );
  }

  if (ch.channel_type === "VOICE") {
    return (
      <div className="flex h-full items-center justify-center gap-3 p-6 text-sm text-muted">
        <Spinner size="sm" />
        Подключение к голосовому каналу…
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragActive ? <DropOverlay channelName={ch.name} allowed={canAttach} /> : null}
      <Topbar
        title={ch.name}
        icon="hash"
        leading={
          openChannels ? <IconButton icon="arrow-left" label="К списку каналов" onPress={openChannels} /> : null
        }
      >
        <Tooltip content={membersOpen ? "Скрыть список участников" : "Показать список участников"} placement="bottom">
          <IconButton
            icon={membersOpen ? "chevron-right" : "chevron-left"}
            label={membersOpen ? "Скрыть список участников" : "Показать список участников"}
            onPress={toggleMembers}
          />
        </Tooltip>
      </Topbar>
      {pinnedMessage ? (
        <PinnedMessageBar
          key={pinnedMessage.id}
          message={pinnedMessage}
          onJump={pinnedLoaded || hasOlderMessages ? () => void jumpToPinned() : undefined}
          loading={pinJumpLoading}
          onUnpin={moderator ? () => togglePin(pinnedMessage, true) : undefined}
          onExternalLink={setPendingExternalUrl}
        />
      ) : null}

      <div className="relative min-h-0 flex-1">
      <div
        ref={listRef}
        onScroll={handleMessageListScroll}
        className="h-full overflow-y-auto py-3"
      >
        {isLoadingOlder ? (
          <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted">
            <Spinner size="sm" />
            Загрузка старых сообщений…
          </div>
        ) : null}

        {historyReady && !hasOlderMessages && rows.length > 0 ? (
          <div className="py-1 text-center font-label text-[10px] uppercase tracking-[0.12em] text-disabled-text">
            Начало истории
          </div>
        ) : null}

        {historyReady && rows.length === 0 && !isLoadingOlder ? (
          <EmptyState
            illustration={<Slime pose="empty" className="w-28" />}
            title="Тут пока тихо"
            description="В этом канале пока ещё нет сообщений. Исправьте это, начните первым!"
          />
        ) : null}

        {rows.map((r, index) => {
          const own = !isTempRow(r) && meId === r.author_id;
          const editing = own && editingId === r.id;
          const prev = rows[index - 1];
          const time = Date.parse(r.created_at);
          const prevTime = prev ? Date.parse(prev.created_at) : Number.NaN;
          const validTime = Number.isFinite(time);
          const prevValid = Number.isFinite(prevTime);
          const newDay =
            validTime && (!prevValid || !sameLocalDay(new Date(time), new Date(prevTime)));
          const grouped =
            Boolean(prev) &&
            prevValid &&
            !newDay &&
            prev.author_id === r.author_id &&
            Math.abs(time - prevTime) < 5 * 60 * 1000;
          return (
            <MessageRow
              key={isTempRow(r) ? r.tempId : r.id}
              row={r}
              grouped={grouped}
              newDay={newDay}
              own={own}
              editing={editing}
              editDraft={editing ? editDraft : ""}
              onEditDraftChange={setEditDraft}
              onSaveEdit={editing ? saveEdit : undefined}
              onCancelEdit={cancelEdit}
              onStartEdit={canSend ? startEdit : undefined}
              onExternalLink={setPendingExternalUrl}
              onRetry={retryMessage}
              onDiscard={discardMessage}
              moderator={moderator}
              onRequestDelete={requestDelete}
              pinned={!isTempRow(r) && r.id === pinnedMessage?.id}
              onTogglePin={moderator ? togglePin : undefined}
              viewerId={meId}
              canReact={canReact}
              onToggleReaction={toggleMessageReaction}
            />
          );
        })}
      </div>
      {jumpToLatestVisible ? (
        <IconButton
          icon="arrow-down"
          label="Прокрутить к последним сообщениям"
          variant="solid"
          size="lg"
          className="absolute bottom-3 right-4 z-10 bg-elevated"
          onPress={scrollChatToLatest}
        />
      ) : null}
      </div>

      {olderErr ? (
        <div className="px-4 pb-2">
          <Alert tone="danger" compact>
            {olderErr}
          </Alert>
        </div>
      ) : null}

      {wsErr ? <ComposerNotice code={wsErr} onClose={clearWsErr} /> : null}

      {canSend ? (
        <ChatComposer
          channelId={ch.id}
          channelName={ch.name}
          canAttach={canAttach}
          attachApiRef={attachApiRef}
          onAttachError={showAttachError}
          onSend={sendMessage}
        />
      ) : (
        <div className="shrink-0 px-4 pb-4">
          <Alert tone="info" compact>
            У вас нет права писать в этом канале
          </Alert>
        </div>
      )}
      {pendingDelete ? (
        <DeleteMessageDialog
          message={pendingDelete}
          onConfirm={() => {
            sendDeleteMessage(pendingDelete.id);
            setPendingDelete(null);
          }}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
      {pendingExternalUrl ? (
        <ExternalLinkDialog
          url={pendingExternalUrl}
          onConfirm={() => {
            openExternalHttps(pendingExternalUrl);
            setPendingExternalUrl(null);
          }}
          onClose={() => setPendingExternalUrl(null)}
        />
      ) : null}
    </div>
  );
}

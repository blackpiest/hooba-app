import { useEffect, useRef } from "react";
import { useMatch } from "react-router-dom";
import notificationUrl from "@/assets/sounds/message.wav";
import { getOutputVolume, volumeToGain } from "@/shared/lib/voice-volume-prefs";
import { subscribeRealtime } from "@/shared/ws/app-realtime";
import { useChannelStore } from "@/stores/channel-store";
import { usePresenceStore } from "@/stores/presence-store";
import { useUserStore } from "@/stores/user-store";
import { getVoiceDeviceIds } from "@/features/voice/voice-settings/voice-settings";
import { playTouchClip } from "@/features/voice/touch-sound-player";
import { isTouchInput } from "@/hooks/use-breakpoint";
import {
  chatNotificationSoundsEnabled,
  isChannelNotificationMuted,
} from "@/features/chat/chat-notification-prefs";
import { messageToastsEnabled } from "@/features/desktop-toasts/toast-prefs";
import {
  memberToastIdentity,
  messageToastPreview,
  pushDesktopToast,
} from "@/features/desktop-toasts/push-desktop-toast";
import {
  appIsOnScreen,
  isDesktopWindowHidden,
  publishTrayAttention,
  setDesktopWindowHidden,
  useDesktopWindowHidden,
} from "@/features/chat/tray-attention";
import {
  clearChannelUnread,
  getUnreadChannelIds,
  markChannelUnread,
  useUnreadChannelIds,
} from "@/features/chat/unread-channels";

type AudioWithSink = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const recentMessageIds = new Set<number>();

function rememberMessage(id: number): boolean {
  if (recentMessageIds.has(id)) {
    return false;
  }
  recentMessageIds.add(id);
  if (recentMessageIds.size > 40) {
    const oldest = recentMessageIds.values().next().value;
    if (oldest !== undefined) {
      recentMessageIds.delete(oldest);
    }
  }
  return true;
}

/**
 * Трей: есть непрочитанное в другом канале, либо окно скрыто или свёрнуто.
 * Снятие фокуса с видимого окна точку не убирает — иначе она пропадает, когда смотришь на трей.
 */
function trayNeedsAttention(openChannelId: number, openIsText: boolean): boolean {
  const unread = getUnreadChannelIds();
  if (unread.length === 0) {
    return false;
  }
  if (isDesktopWindowHidden() || document.visibilityState !== "visible") {
    return true;
  }
  return unread.some((id) => !openIsText || id !== openChannelId);
}

function playChatNotification(): void {
  // Телефон: звук приходит без нажатия — Safari пропускает его у нового <audio>, а общий Web Audio контекст играет.
  if (isTouchInput()) {
    void playTouchClip(notificationUrl, Math.min(1, volumeToGain(getOutputVolume())));
    return;
  }
  const el = new Audio(notificationUrl);
  el.volume = Math.min(1, volumeToGain(getOutputVolume()));
  const { outputDeviceId } = getVoiceDeviceIds();
  const withSink = el as AudioWithSink;
  const play = () => {
    void el.play().catch(() => {
      /* вкладка ещё не получала жест или звук заблокирован */
    });
  };
  if (outputDeviceId && typeof withSink.setSinkId === "function") {
    void withSink.setSinkId(outputDeviceId).then(play, play);
    return;
  }
  play();
}

/** Чужое сообщение: звук и непрочитанное, если окно не читает этот текстовый канал. */
export function useChatMessageSound(): void {
  const meId = useUserStore((s) => s.me?.id ?? null);
  const channels = useChannelStore((s) => s.channels);
  const unreadIds = useUnreadChannelIds();
  const windowHidden = useDesktopWindowHidden();
  const match = useMatch("/app/channels/:channelId");
  const routeChannelId = Number(match?.params.channelId);
  const meIdRef = useRef(meId);
  const channelsRef = useRef(channels);
  const routeChannelIdRef = useRef(routeChannelId);
  meIdRef.current = meId;
  channelsRef.current = channels;
  routeChannelIdRef.current = routeChannelId;

  useEffect(() => {
    return subscribeRealtime((event, data) => {
      if (event !== "message:new") {
        return;
      }
      const message = data.message;
      if (!message || typeof message !== "object") {
        return;
      }
      const row = message as { id?: unknown; channel_id?: unknown; author_id?: unknown };
      const channelId = Number(row.channel_id);
      const authorId = Number(row.author_id);
      const messageId = Number(row.id);
      if (!Number.isFinite(channelId) || !Number.isFinite(authorId)) {
        return;
      }
      if (meIdRef.current != null && authorId === meIdRef.current) {
        return;
      }
      if (Number.isFinite(messageId) && !rememberMessage(messageId)) {
        return;
      }
      const target = channelsRef.current.find((channel) => channel.id === channelId);
      if (target && target.channel_type !== "TEXT") {
        return;
      }
      const openChannel = channelsRef.current.find((channel) => channel.id === routeChannelIdRef.current);
      const readingThisChannel =
        appIsOnScreen() && openChannel?.channel_type === "TEXT" && openChannel.id === channelId;
      if (readingThisChannel) {
        clearChannelUnread(channelId);
        return;
      }
      markChannelUnread(channelId);
      if (usePresenceStore.getState().selfPreference === "dnd") {
        return;
      }
      if (isChannelNotificationMuted(channelId)) {
        return;
      }
      if (messageToastsEnabled()) {
        const extra = message as { content?: unknown; author_username?: unknown; attachments?: unknown };
        const author = memberToastIdentity(
          authorId,
          typeof extra.author_username === "string" ? extra.author_username : "",
        );
        pushDesktopToast({
          kind: "message",
          title: author.name,
          body: messageToastPreview(
            typeof extra.content === "string" ? extra.content : "",
            Array.isArray(extra.attachments) ? extra.attachments.length : 0,
          ),
          meta: target ? `#${target.name}` : "",
          avatar: author.avatar,
          channelId,
        });
      }
      if (chatNotificationSoundsEnabled()) {
        playChatNotification();
      }
    });
  }, []);

  useEffect(() => {
    const desktop = window.hoobaDesktop;
    if (!desktop?.onWindowHidden) {
      return;
    }
    const unsubscribe = desktop.onWindowHidden(setDesktopWindowHidden);
    void desktop.windowHidden?.().then((hidden) => {
      if (typeof hidden === "boolean") {
        setDesktopWindowHidden(hidden);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const sync = () => {
      const openChannel = channelsRef.current.find((channel) => channel.id === routeChannelIdRef.current);
      const openIsText = openChannel?.channel_type === "TEXT";
      if (appIsOnScreen() && openIsText && openChannel) {
        clearChannelUnread(openChannel.id);
      }
      publishTrayAttention(trayNeedsAttention(routeChannelIdRef.current, openIsText));
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  }, [channels, routeChannelId, unreadIds, windowHidden]);

  useEffect(() => {
    return () => publishTrayAttention(false);
  }, []);
}

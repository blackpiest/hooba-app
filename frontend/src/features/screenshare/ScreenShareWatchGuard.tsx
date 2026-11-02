import { useEffect, useRef } from "react";
import { useMatch } from "react-router-dom";
import { useChannelStore } from "@/stores/channel-store";
import { useScreenShareStore } from "./screen-share-store";

/** Смена текстового канала сворачивает просмотр (или превью ведущего) в окно, голос при этом остаётся. */
export function ScreenShareWatchGuard() {
  const match = useMatch("/app/channels/:channelId");
  const channelId = Number(match?.params.channelId);
  const channels = useChannelStore((s) => s.channels);
  const watchingChannelId = useScreenShareStore((s) => s.watchingChannelId);
  const hostStageOpen = useScreenShareStore((s) => s.hostView === "stage");
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    if (watchingChannelId == null && !hostStageOpen) {
      anchor.current = null;
      return;
    }
    if (!Number.isFinite(channelId)) {
      return;
    }
    const channel = channels.find((item) => item.id === channelId);
    if (!channel || channel.channel_type !== "TEXT") {
      return;
    }
    if (anchor.current == null) {
      anchor.current = channelId;
      return;
    }
    if (anchor.current !== channelId) {
      anchor.current = channelId;
      useScreenShareStore.getState().collapseToPip();
    }
  }, [channelId, channels, hostStageOpen, watchingChannelId]);

  return null;
}

import { getVoiceMediasoupHandle } from "@/features/voice/voice-settings/voice-settings";
import { connectVoiceChannel } from "@/features/voice/voice-session";
import { useVoiceSessionUi } from "@/features/voice/voice-session";
import type { VoiceMediasoupHandle } from "@/features/voice/webrtc-voice.types";
import { useUserStore } from "@/stores/user-store";
import { useVoiceRoomsStore } from "@/stores/voice-rooms-store";
import { useVoiceStore } from "@/stores/voice-store";
import { useScreenShareStore } from "./screen-share-store";

function currentVoiceChannelId(): number | null {
  return useVoiceStore.getState().activeChannelId ?? useVoiceSessionUi.getState().intendedChannelId;
}

export function waitForVoiceHandle(channelId: number, timeoutMs = 20_000): Promise<VoiceMediasoupHandle> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (useScreenShareStore.getState().watchingChannelId !== channelId) {
        reject(new Error("cancelled"));
        return;
      }
      const active = useVoiceStore.getState().activeChannelId;
      const handle = getVoiceMediasoupHandle();
      if (active === channelId && handle) {
        resolve(handle);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Голосовой канал не подключился"));
        return;
      }
      window.setTimeout(tick, 200);
    };
    tick();
  });
}

/** Попап «Присоединиться»: войти в голос этой комнаты и открыть сцену. */
export function requestJoinScreenShare(channelId: number): void {
  const meId = useUserStore.getState().me?.id ?? null;
  const share = useVoiceRoomsStore.getState().screenShareByChannelId[channelId];
  if (!share || (meId != null && share.user_id === meId)) {
    return;
  }
  const screen = useScreenShareStore.getState();
  if (screen.hosting && screen.hostChannelId !== channelId) {
    screen.requestVoiceSwitch(channelId, true);
    return;
  }
  const voiceId = currentVoiceChannelId();
  if (voiceId !== channelId) {
    if (voiceId != null) {
      screen.requestWatchSwitch(channelId);
      return;
    }
    connectVoiceChannel(channelId);
  }
  screen.setWatching(channelId);
}

export function confirmWatchSwitch(): void {
  const channelId = useScreenShareStore.getState().pendingWatchSwitchId;
  useScreenShareStore.getState().clearWatchSwitch();
  if (channelId == null) {
    return;
  }
  connectVoiceChannel(channelId);
  useScreenShareStore.getState().setWatching(channelId);
}

export async function confirmVoiceSwitch(): Promise<void> {
  const { pendingVoiceSwitchId, watchAfterSwitch } = useScreenShareStore.getState();
  useScreenShareStore.getState().clearVoiceSwitch();
  await getVoiceMediasoupHandle()?.stopScreenShare();
  useScreenShareStore.getState().setHosting(null);
  if (pendingVoiceSwitchId == null) {
    return;
  }
  connectVoiceChannel(pendingVoiceSwitchId);
  if (watchAfterSwitch) {
    useScreenShareStore.getState().setWatching(pendingVoiceSwitchId);
  }
}

export function stopWatchingScreenShare(): void {
  getVoiceMediasoupHandle()?.stopWatchingScreenShare();
  useScreenShareStore.getState().setWatching(null);
}

import { create } from "zustand";
import { registerSessionClear } from "@/shared/lib/session-reset";
import { forgetDesiredVoiceChannel, joinVoiceChannel, subscribeRealtime } from "@/shared/ws/app-realtime";
import { isVoiceChannelClosedInStore } from "@/stores/voice-room-capacity";
import { useVoiceStore, type VoiceParticipant } from "@/stores/voice-store";
import {
  getVoiceDeviceIds,
  getVoiceMediasoupHandle,
  useVoiceSettingsStore,
} from "../voice-settings/voice-settings";
import type { VoiceMediasoupHandle } from "../webrtc-voice.types";
import {
  discardPrimedVoiceAudioContext,
  primeVoiceAudioFromUserGesture,
} from "../voice-audio-unlock";
import { useScreenShareStore } from "@/features/screenshare/screen-share-store";
import { SCREEN_SHARE_PROFILES } from "@/features/screenshare/screen-share-profiles";
import { toast } from "@/shared/ui";
import { useVoiceRoomsStore } from "@/stores/voice-rooms-store";
import {
  playVoiceDeafenedSound,
  playVoiceMemberJoinedSound,
  playVoiceMemberLeftSound,
  playVoiceMutedSound,
  playStreamJoinedSound,
  playStreamLeftSound,
  playVoiceUndeafenedSound,
  playVoiceUnmutedSound,
} from "../voice-channel-sounds";

type VoiceSessionUiState = {
  error: string | null;
  /** Голосовой канал, к которому пользователь подключён или подключается. */
  intendedChannelId: number | null;
  setError: (error: string | null) => void;
  setIntendedChannelId: (channelId: number | null) => void;
};

export const useVoiceSessionUi = create<VoiceSessionUiState>((set) => ({
  error: null,
  intendedChannelId: null,
  setError: (error) => set({ error }),
  setIntendedChannelId: (channelId) => set({ intendedChannelId: channelId }),
}));

function getIntendedVoiceChannelId(): number | null {
  return useVoiceSessionUi.getState().intendedChannelId;
}

function setIntendedVoiceChannelId(channelId: number | null) {
  useVoiceSessionUi.getState().setIntendedChannelId(channelId);
}
let currentUserId: number | null = null;
let wsListenerAttached = false;
let unsubscribeWs: (() => void) | null = null;
const msRef: { current: VoiceMediasoupHandle | null } = { current: null };
let voiceMsGen = 0;
let voiceJoinInFlight = false;
let snapshotSyncTimer: ReturnType<typeof setTimeout> | null = null;
/** Захват показа, ждущий публикации в новом handle (переподключение к той же комнате). */
let carriedScreen: MediaStream | null = null;

function clearLocalVoiceMedia() {
  msRef.current?.stop();
  msRef.current = null;
  useVoiceSettingsStore.getState().setMediasoupHandle(null);
}

function stopLocalVoiceMedia() {
  voiceMsGen += 1;
  dropCarriedScreenShare(false);
  discardPrimedVoiceAudioContext();
  clearLocalVoiceMedia();
}

/** Переподключение к той же комнате не обрывает показ: захват переносим в новый handle. */
function carryScreenShare(channelId: number) {
  const screen = useScreenShareStore.getState();
  if (!screen.hosting || screen.hostChannelId !== channelId) {
    dropCarriedScreenShare(false);
    return;
  }
  carriedScreen = msRef.current?.detachScreenShare() ?? carriedScreen;
}

function dropCarriedScreenShare(notify: boolean) {
  const stream = carriedScreen;
  if (!stream) {
    return;
  }
  carriedScreen = null;
  stream.getTracks().forEach((track) => track.stop());
  useScreenShareStore.getState().setHosting(null);
  if (notify) {
    toast.warning("Демонстрация прервана", "Не удалось возобновить показ после переподключения");
  }
}

async function resumeCarriedScreenShare(h: VoiceMediasoupHandle, gen: number) {
  const stream = carriedScreen;
  if (!stream) {
    return;
  }
  const screen = useScreenShareStore.getState();
  const live = stream.getVideoTracks()[0]?.readyState === "live";
  if (!live || !screen.hosting || screen.hostInfo == null) {
    dropCarriedScreenShare(false);
    return;
  }
  carriedScreen = null;
  const profile = SCREEN_SHARE_PROFILES[screen.hostInfo.quality];
  try {
    await h.publishScreenShare(
      stream,
      { maxBitrate: profile.maxBitrate, maxFramerate: profile.frameRate },
      { silent: true },
    );
    h.setScreenAudioEnabled(!useScreenShareStore.getState().hostAudioMuted);
  } catch (error) {
    console.error("[voice] resume screen share", error);
    stream.getTracks().forEach((track) => track.stop());
    if (gen === voiceMsGen) {
      useScreenShareStore.getState().setHosting(null);
      toast.warning("Демонстрация прервана", "Не удалось возобновить показ после переподключения");
    }
  }
}

function startMediasoupForChannel(channelId: number) {
  voiceMsGen += 1;
  const gen = voiceMsGen;
  carryScreenShare(channelId);
  void (async () => {
    try {
      clearLocalVoiceMedia();
      const { startVoiceMediasoup } = await import("../webrtc-voice");
      const { inputDeviceId, outputDeviceId } = getVoiceDeviceIds();
      const h = await startVoiceMediasoup(channelId, {
        inputDeviceId: inputDeviceId || null,
        outputDeviceId: outputDeviceId || null,
        onSpeaking: (speaking) => {
          if (currentUserId == null) {
            return;
          }
          useVoiceStore.getState().applyUserState(channelId, currentUserId, { speaking });
        },
        onRemoteHearing: (userId, hearing) => {
          useVoiceStore.getState().setInboundHearing(userId, hearing);
        },
      });
      if (gen !== voiceMsGen) {
        // Захват (если есть) остаётся в carriedScreen для более нового запуска.
        h.stop();
        return;
      }
      msRef.current = h;
      useVoiceSettingsStore.getState().setMediasoupHandle(h);
      const self = getLocalVoiceParticipant();
      if (self?.muted) {
        h.setMicMuted(true);
      }
      if (self?.deafened) {
        h.setDeafened(true);
      }
      void resumeCarriedScreenShare(h, gen);
    } catch (e: unknown) {
      if (gen === voiceMsGen) {
        dropCarriedScreenShare(true);
        stopLocalVoiceMedia();
        const m = e instanceof Error ? e.message : "";
        useVoiceSessionUi
          .getState()
          .setError(
            m === "MEDIASOUP_UNAVAILABLE"
              ? "Голос SFU на сервере выключен (нет mediasoup worker). Вход и чат работают."
              : m || "mediasoup"
          );
        useVoiceSettingsStore.getState().setHideDebug(true);
      }
    }
  })();
}

function voiceErrorText(code: string): string {
  switch (code) {
    case "VOICE_ROOM_FULL":
      return "Канал заполнен";
    case "VOICE_CHANNEL_NOT_FOUND":
    case "INVALID_CHANNEL_TYPE":
    case "FORBIDDEN":
      return "Нет доступа к каналу";
    default:
      return "Ошибка голосовой связи";
  }
}

function handleVoiceLeft(channelId: number | undefined) {
  if (typeof channelId === "number") {
    useVoiceStore.getState().clearIfChannel(channelId);
  }
  useScreenShareStore.getState().resetSession();
  stopLocalVoiceMedia();
}

function isUserInSnapshotRoom(
  channelId: number,
  rooms: { channel_id: number; participants: { user_id: number }[] }[]
): boolean {
  if (currentUserId == null) {
    return false;
  }
  const room = rooms.find((r) => r.channel_id === channelId);
  return room?.participants.some((p) => p.user_id === currentUserId) ?? false;
}

function isVoiceSessionHealthy(channelId: number): boolean {
  const active = useVoiceStore.getState().activeChannelId;
  const hasMedia = msRef.current != null || getVoiceMediasoupHandle() != null;
  return active === channelId && hasMedia;
}

function isLocalUserDeafened(): boolean {
  if (currentUserId == null) {
    return false;
  }
  const self = useVoiceStore
    .getState()
    .participants.find((p) => p.user_id === currentUserId);
  return self?.deafened ?? false;
}

function getLocalVoiceParticipant(): VoiceParticipant | undefined {
  if (currentUserId == null) {
    return undefined;
  }
  return useVoiceStore
    .getState()
    .participants.find((p) => p.user_id === currentUserId);
}

/** Слышим join/leave, если мы в этом канале (подключены или подключаемся). */
function shouldHearVoiceChannelSounds(channelId: number): boolean {
  const active = useVoiceStore.getState().activeChannelId;
  const intended = getIntendedVoiceChannelId();
  return active === channelId || intended === channelId;
}

function maybePlayVoiceJoinSound(channelId: number): void {
  if (!shouldHearVoiceChannelSounds(channelId) || isLocalUserDeafened()) {
    return;
  }
  playVoiceMemberJoinedSound();
}

function maybePlayVoiceLeaveSound(channelId: number): void {
  if (!shouldHearVoiceChannelSounds(channelId) || isLocalUserDeafened()) {
    return;
  }
  playVoiceMemberLeftSound();
}

/**
 * Повторный voice:join — только если сессия реально потеряна (reconnect WS и т.п.).
 * Не вызывать при смене текстового канала: лишний join рвёт комнату на сервере.
 */
export function reassertVoiceJoin(): void {
  const channelId = getIntendedVoiceChannelId();
  if (channelId == null || voiceJoinInFlight) {
    return;
  }
  if (isVoiceSessionHealthy(channelId)) {
    return;
  }
  voiceJoinInFlight = true;
  useVoiceSessionUi.getState().setError(null);
  joinVoiceChannel(channelId);
}

/**
 * Сверка со snapshot: переподключение только если нас долго нет в комнате.
 */
export function syncVoiceMembershipFromSnapshot(
  rooms: { channel_id: number; participants: { user_id: number }[] }[]
): void {
  const channelId = getIntendedVoiceChannelId();
  if (channelId == null) {
    return;
  }
  if (isUserInSnapshotRoom(channelId, rooms)) {
    if (snapshotSyncTimer) {
      clearTimeout(snapshotSyncTimer);
      snapshotSyncTimer = null;
    }
    return;
  }
  if (isVoiceSessionHealthy(channelId)) {
    return;
  }
  if (snapshotSyncTimer) {
    clearTimeout(snapshotSyncTimer);
  }
  snapshotSyncTimer = setTimeout(() => {
    snapshotSyncTimer = null;
    const intended = getIntendedVoiceChannelId();
    if (intended == null || intended !== channelId) {
      return;
    }
    if (isVoiceSessionHealthy(intended)) {
      return;
    }
    reassertVoiceJoin();
  }, 400);
}

export function setVoiceSessionUserId(userId: number | null) {
  currentUserId = userId;
}

/** Подключиться к голосовому каналу (фоново, без смены текстового чата). */
export function connectVoiceChannel(channelId: number): void {
  if (isVoiceChannelClosedInStore(channelId, currentUserId, getIntendedVoiceChannelId())) {
    return;
  }
  const screen = useScreenShareStore.getState();
  if (screen.hosting && screen.hostChannelId !== channelId) {
    screen.requestVoiceSwitch(channelId);
    return;
  }
  if (screen.watchingChannelId != null && screen.watchingChannelId !== channelId) {
    getVoiceMediasoupHandle()?.stopWatchingScreenShare();
    screen.setWatching(null);
  }
  if (!isVoiceSessionHealthy(channelId)) {
    primeVoiceAudioFromUserGesture();
  }
  setIntendedVoiceChannelId(channelId);
  useVoiceSessionUi.getState().setError(null);
  if (isVoiceSessionHealthy(channelId)) {
    return;
  }
  voiceJoinInFlight = true;
  joinVoiceChannel(channelId);
}

/** Покинуть текущий голосовой канал. */
export function leaveVoiceChannel(): void {
  const channelId =
    useVoiceStore.getState().activeChannelId ?? getIntendedVoiceChannelId();
  void getVoiceMediasoupHandle()?.stopScreenShare();
  getVoiceMediasoupHandle()?.stopWatchingScreenShare();
  useScreenShareStore.getState().resetSession();
  if (channelId != null) {
    maybePlayVoiceLeaveSound(channelId);
  }
  setIntendedVoiceChannelId(null);
  joinVoiceChannel(null);
}

export function teardownVoiceSessionWs(): void {
  if (!wsListenerAttached) {
    return;
  }
  wsListenerAttached = false;
  unsubscribeWs?.();
  unsubscribeWs = null;
  if (snapshotSyncTimer) {
    clearTimeout(snapshotSyncTimer);
    snapshotSyncTimer = null;
  }
  voiceJoinInFlight = false;
  setIntendedVoiceChannelId(null);
  stopLocalVoiceMedia();
  useVoiceStore.getState().clear();
  useVoiceSessionUi.getState().setError(null);
}

export function ensureVoiceSessionWsAttached() {
  if (wsListenerAttached) {
    return;
  }
  wsListenerAttached = true;

  unsubscribeWs = subscribeRealtime((event, data) => {
    if (event === "auth:success" || event === "auth:identified") {
      useVoiceSessionUi.getState().setError(null);
      reassertVoiceJoin();
      return;
    }
    if (event === "voice:joined") {
      voiceJoinInFlight = false;
      const channel_id = data.channel_id;
      const participants = data.participants;
      const alreadyInChannel =
        typeof channel_id === "number" &&
        useVoiceStore.getState().activeChannelId === channel_id;
      if (typeof channel_id === "number" && Array.isArray(participants)) {
        setIntendedVoiceChannelId(channel_id);
        useVoiceStore
          .getState()
          .setJoined(channel_id, participants as VoiceParticipant[]);
      }
      useVoiceSessionUi.getState().setError(null);
      useVoiceSettingsStore.getState().setHideDebug(false);
      if (typeof channel_id === "number") {
        startMediasoupForChannel(channel_id);
        if (!alreadyInChannel) {
          maybePlayVoiceJoinSound(channel_id);
        }
      }
      return;
    }
    if (event === "voice:user_joined") {
      const channel_id = data.channel_id;
      const user = data.user as VoiceParticipant | undefined;
      if (
        typeof channel_id === "number" &&
        user &&
        typeof user.user_id === "number"
      ) {
        useVoiceStore.getState().applyUserJoined(channel_id, user);
        maybePlayVoiceJoinSound(channel_id);
      }
      return;
    }
    if (event === "voice:user_left") {
      const channel_id = data.channel_id;
      const user_id = data.user_id;
      if (typeof channel_id === "number" && typeof user_id === "number") {
        const isSelf = currentUserId !== null && user_id === currentUserId;
        const intended = getIntendedVoiceChannelId();
        if (isSelf && intended === channel_id) {
          // Собственный user_left при re-join на сервере — не рвём локальную сессию.
          return;
        }
        const heard = shouldHearVoiceChannelSounds(channel_id);
        useVoiceStore.getState().applyUserLeft(channel_id, user_id);
        if (heard && !(isSelf && intended == null)) {
          maybePlayVoiceLeaveSound(channel_id);
        }
        if (isSelf && intended == null) {
          handleVoiceLeft(channel_id);
        }
      }
      return;
    }
    if (event === "voice:screen_audience") {
      const channel_id = data.channel_id;
      const user_id = data.user_id;
      const action = data.action;
      if (
        typeof channel_id !== "number" ||
        typeof user_id !== "number" ||
        (action !== "joined" && action !== "left" && action !== "ended")
      ) {
        return;
      }
      if (currentUserId !== null && user_id === currentUserId) {
        return;
      }
      const screen = useScreenShareStore.getState();
      const share = useVoiceRoomsStore.getState().screenShareByChannelId[channel_id];
      const isHost =
        (screen.hosting && screen.hostChannelId === channel_id) ||
        (currentUserId !== null && share?.user_id === currentUserId);
      const watching = screen.watchingChannelId === channel_id;
      if (!isHost && !watching) {
        return;
      }
      if (action === "joined") {
        playStreamJoinedSound();
      } else {
        playStreamLeftSound();
      }
      return;
    }
    if (event === "voice:user_state") {
      const channel_id = data.channel_id;
      const user_id = data.user_id;
      if (typeof channel_id !== "number" || typeof user_id !== "number") {
        return;
      }
      const patch: Partial<
        Pick<VoiceParticipant, "muted" | "server_muted" | "speak_denied" | "deafened" | "speaking">
      > = {};
      if (typeof data.muted === "boolean") patch.muted = data.muted;
      if (typeof data.server_muted === "boolean") patch.server_muted = data.server_muted;
      if (typeof data.speak_denied === "boolean") patch.speak_denied = data.speak_denied;
      if (typeof data.deafened === "boolean") patch.deafened = data.deafened;
      if (typeof data.speaking === "boolean") patch.speaking = data.speaking;
      const previousSelf =
        currentUserId !== null && user_id === currentUserId
          ? getLocalVoiceParticipant()
          : undefined;
      useVoiceStore.getState().applyUserState(channel_id, user_id, patch);
      const handle = msRef.current ?? getVoiceMediasoupHandle();
      if (currentUserId !== null && user_id === currentUserId) {
        if (
          previousSelf &&
          typeof data.muted === "boolean" &&
          previousSelf?.muted !== data.muted
        ) {
          if (data.muted) {
            playVoiceMutedSound();
          } else {
            playVoiceUnmutedSound();
          }
        }
        if (
          previousSelf &&
          typeof data.deafened === "boolean" &&
          previousSelf?.deafened !== data.deafened
        ) {
          if (data.deafened) {
            playVoiceDeafenedSound();
          } else {
            playVoiceUndeafenedSound();
          }
        }
      }
      if (currentUserId !== null && user_id === currentUserId && handle) {
        if (typeof data.muted === "boolean") {
          handle.setMicMuted(data.muted);
        }
        if (typeof data.deafened === "boolean") {
          handle.setDeafened(data.deafened);
        }
      }
      return;
    }
    if (event === "voice:moved") {
      const channel_id = data.channel_id;
      if (typeof channel_id === "number") {
        connectVoiceChannel(channel_id);
      }
      return;
    }
    if (event === "voice:left") {
      voiceJoinInFlight = false;
      const channel_id = data.channel_id;
      const intended = getIntendedVoiceChannelId();
      const channel = typeof channel_id === "number" ? channel_id : undefined;
      if (data.forced === true) {
        const active = useVoiceStore.getState().activeChannelId;
        const matches = channel == null || intended === channel || active === channel;
        if (matches) {
          if (channel != null) {
            maybePlayVoiceLeaveSound(channel);
          }
          setIntendedVoiceChannelId(null);
          forgetDesiredVoiceChannel();
          handleVoiceLeft(channel);
        }
        return;
      }
      if (intended == null) {
        handleVoiceLeft(channel);
      }
      return;
    }
    if (event === "voice:error") {
      // Ответ на voice:signal: его получает requestVoiceSignal, к состоянию сессии не относится
      // (запоздалый запрос старого медиа после смены канала / переподключения WS).
      if (typeof data.request_id === "string") {
        return;
      }
      const code = typeof data.code === "string" ? data.code : "VOICE_ERROR";
      // speaking/mute/deafen, ушедшие до voice:joined: голос при этом работает. Если сессия
      // действительно потеряна — переподключаемся, а не показываем код.
      if (code === "VOICE_NOT_CONNECTED") {
        reassertVoiceJoin();
        return;
      }
      voiceJoinInFlight = false;
      if (code === "VOICE_CHANNEL_NOT_FOUND") {
        leaveVoiceChannel();
      }
      useVoiceSessionUi.getState().setError(voiceErrorText(code));
    }
  });
}

registerSessionClear(() => {
  void getVoiceMediasoupHandle()?.stopScreenShare();
  getVoiceMediasoupHandle()?.stopWatchingScreenShare();
  useScreenShareStore.getState().resetSession();
  setIntendedVoiceChannelId(null);
  forgetDesiredVoiceChannel();
  stopLocalVoiceMedia();
  voiceJoinInFlight = false;
  useVoiceStore.getState().clear();
  useVoiceRoomsStore.getState().clear();
  useVoiceSessionUi.getState().setError(null);
});

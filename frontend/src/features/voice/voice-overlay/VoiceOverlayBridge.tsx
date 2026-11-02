import { useEffect } from "react";
import { useUserStore } from "@/stores/user-store";
import { useMemberProfileStore, type MemberProfile } from "@/stores/member-profile-store";
import { resolveAvatarLook, useAvatarStore } from "@/stores/avatar-store";
import type { AvatarCatalog, UserAvatar } from "@/shared/api/avatars";
import { useVoiceStore, type VoiceParticipant } from "@/stores/voice-store";
import { isDesktopApp } from "@/shared/lib/server-target";
import { displayNameOf } from "@/shared/lib/display-name";
import {
  useVoiceOverlayEnabled,
  useVoiceOverlayOnlyInGame,
  type VoiceOverlaySnapshot,
} from "@/shared/lib/voice-overlay";
import { useGameRunning } from "./use-game-running";

const OVERLAY_PARTICIPANT_LIMIT = 8;

function buildSnapshot(
  enabled: boolean,
  channelName: string | undefined,
  activeChannelId: number | null,
  participants: VoiceParticipant[],
  inboundHearing: Record<string, boolean>,
  meId: number | null,
  catalog: AvatarCatalog | null,
  avatarByUserId: Record<number, UserAvatar | null>,
  profileByUserId: Record<number, MemberProfile>,
): VoiceOverlaySnapshot | null {
  const name = channelName?.trim().slice(0, 80) ?? "";
  if (!enabled || activeChannelId == null || name.length === 0 || participants.length === 0) {
    return null;
  }
  const rows: VoiceOverlaySnapshot["participants"] = [];
  for (const participant of participants.slice(0, OVERLAY_PARTICIPANT_LIMIT)) {
    // Поле протокола называется `username`, но показываем отображаемое имя.
    const profile = profileByUserId[participant.user_id];
    const username = (profile ? displayNameOf(profile) : participant.username).trim().slice(0, 64);
    if (!Number.isInteger(participant.user_id) || participant.user_id < 1 || username.length === 0) {
      continue;
    }
    rows.push({
      userId: participant.user_id,
      username,
      muted: participant.muted,
      deafened: participant.deafened,
      speaking:
        meId !== null && participant.user_id === meId
          ? participant.speaking
          : inboundHearing[String(participant.user_id)] === true,
      avatar: resolveAvatarLook(catalog, avatarByUserId[participant.user_id]),
    });
  }
  if (rows.length === 0) {
    return null;
  }
  return { channelName: name, participants: rows };
}

export function VoiceOverlayBridge({ channelName }: { channelName?: string }) {
  const overlayOn = useVoiceOverlayEnabled();
  const onlyInGame = useVoiceOverlayOnlyInGame();
  const activeChannelId = useVoiceStore((s) => s.activeChannelId);
  const gameRunning = useGameRunning(overlayOn && onlyInGame && activeChannelId != null);
  const enabled = overlayOn && (!onlyInGame || gameRunning);
  const participants = useVoiceStore((s) => s.participants);
  const inboundHearing = useVoiceStore((s) => s.inboundHearing);
  const meId = useUserStore((s) => s.me?.id ?? null);
  const catalog = useAvatarStore((s) => s.catalog);
  const avatarByUserId = useAvatarStore((s) => s.avatarByUserId);
  const profileByUserId = useMemberProfileStore((s) => s.profileByUserId);

  useEffect(() => {
    if (!isDesktopApp()) {
      return;
    }
    window.hoobaDesktop?.publishVoiceOverlay?.(
      buildSnapshot(
        enabled,
        channelName,
        activeChannelId,
        participants,
        inboundHearing,
        meId,
        catalog,
        avatarByUserId,
        profileByUserId,
      ),
    );
  }, [enabled, channelName, activeChannelId, participants, inboundHearing, meId, catalog, avatarByUserId, profileByUserId]);

  useEffect(() => {
    if (!isDesktopApp()) {
      return;
    }
    return () => {
      window.hoobaDesktop?.publishVoiceOverlay?.(null);
    };
  }, []);

  return null;
}

import { useEffect } from "react";
import {
  ensureVoiceSessionWsAttached,
  setVoiceSessionUserId,
} from "./voice-session";

/** Монтируется один раз в AppShell — не размонтируется при смене текстового канала. */
export function VoiceSessionHost({ userId }: { userId: number | null }) {
  useEffect(() => {
    setVoiceSessionUserId(userId);
  }, [userId]);

  useEffect(() => {
    ensureVoiceSessionWsAttached();
  }, []);

  return null;
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, SpeakingEq } from "@/shared/ui";
import type { VoiceOverlaySnapshot } from "@/shared/lib/voice-overlay";
import { cx } from "@/utils/cx";
import { UserAvatar } from "@/shared/ui/user-avatar/UserAvatar";

if (typeof document !== "undefined" && window.location.pathname === "/overlay") {
  document.documentElement.classList.add("ds-overlay");
}

function OverlayBadge({
  title,
  variant,
}: {
  title: string;
  variant: "mute" | "deafen";
}) {
  return (
    <span
      className="inline-flex size-[18px] shrink-0 items-center justify-center bg-bg/70 text-fg"
      aria-label={title}
    >
      <Icon name={variant === "mute" ? "mic-off" : "volume-off"} size="xs" />
    </span>
  );
}

export function VoiceOverlayPage() {
  const [snapshot, setSnapshot] = useState<VoiceOverlaySnapshot | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    document.documentElement.classList.add("ds-overlay");
    return () => document.documentElement.classList.remove("ds-overlay");
  }, []);

  useEffect(() => {
    const blockNativeMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("contextmenu", blockNativeMenu);
    return () => document.removeEventListener("contextmenu", blockNativeMenu);
  }, []);

  useEffect(() => {
    const api = window.hoobaDesktop;
    if (!api?.onVoiceOverlay) {
      return;
    }
    let cancelled = false;
    void api.getVoiceOverlay?.().then((current) => {
      if (!cancelled) {
        setSnapshot(current);
      }
    });
    const unsubscribe = api.onVoiceOverlay((next) => {
      if (!cancelled) {
        setSnapshot(next);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const report = () => {
      window.hoobaDesktop?.resizeOverlay?.(card.offsetHeight);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(card);
    return () => observer.disconnect();
  }, [snapshot]);

  if (!snapshot || snapshot.participants.length === 0) {
    return null;
  }

  return (
    <div ref={cardRef} className="box-border w-[240px] text-fg">
      <ul className="m-0 list-none flex flex-col gap-0.5 px-2.5 py-2">
        {snapshot.participants.map((participant) => (
          <li
            key={participant.userId}
            className={cx(
              "flex w-fit max-w-full items-center gap-2 py-1 text-sm text-fg transition-opacity duration-100",
              participant.speaking ? "opacity-100" : "opacity-60",
            )}
          >
            <span className="relative inline-flex shrink-0">
              <UserAvatar
                look={participant.avatar ?? null}
                name={participant.username}
                size="sm"
                speaking={participant.speaking}
              />
              {participant.speaking ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/50">
                  <SpeakingEq />
                </span>
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate bg-bg/70 px-1.5 tracking-wide">{participant.username}</span>
            {participant.muted || participant.deafened ? (
              <span className="flex shrink-0 items-center gap-0.5">
                {participant.muted ? <OverlayBadge title="Микрофон выключен" variant="mute" /> : null}
                {participant.deafened ? <OverlayBadge title="Звук отключён" variant="deafen" /> : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

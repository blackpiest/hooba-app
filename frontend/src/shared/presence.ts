export type PresencePreference = "online" | "idle" | "dnd" | "invisible";
export type PublicPresenceStatus = "online" | "idle" | "dnd" | "offline";

export const PRESENCE_PREFERENCES = ["online", "idle", "dnd", "invisible"] as const;

export const PUBLIC_STATUS_LABEL: Record<PublicPresenceStatus, string> = {
  online: "В сети",
  idle: "Отошёл",
  dnd: "Не беспокоить",
  offline: "Не в сети",
};

export function isPresencePreference(value: unknown): value is PresencePreference {
  return value === "online" || value === "idle" || value === "dnd" || value === "invisible";
}

export function isPublicPresenceStatus(value: unknown): value is PublicPresenceStatus {
  return value === "online" || value === "idle" || value === "dnd" || value === "offline";
}

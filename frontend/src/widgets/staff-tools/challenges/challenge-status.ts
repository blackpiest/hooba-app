import type { ChallengeStatus } from "@/shared/api/challenges";

/** Плашка статуса испытания в списке и в шапке редактора. */
export const CHALLENGE_STATUS: Record<ChallengeStatus, { label: string; variant: "neutral" | "brand" | "success" }> = {
  draft: { label: "Черновик", variant: "neutral" },
  active: { label: "Активно", variant: "success" },
  archived: { label: "Архив", variant: "neutral" },
};

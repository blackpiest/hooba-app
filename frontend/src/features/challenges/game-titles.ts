import type { GameCatalogEntry } from "@/shared/api/game-activity";

/**
 * Названия игр для выбора: у одной игры бывает несколько процессов. Сравнение точное: прогресс испытания
 * считается по точному названию, поэтому `Dota 2` и `DOTA 2` были бы разными играми.
 */
export function uniqueGameTitles(entries: readonly GameCatalogEntry[]): string[] {
  const titles = new Set(entries.map((entry) => entry.title.trim()).filter(Boolean));
  return [...titles].sort((a, b) => a.localeCompare(b));
}

import type { AvatarCatalog } from "@/shared/api/avatars";
import type { CosmeticKind, CosmeticReward } from "@/shared/api/challenges";
import { COSMETIC_KIND_LABEL } from "./condition-text";

/** Название предмета каталога; нет в каталоге — id. */
export function cosmeticName(catalog: AvatarCatalog | null, kind: CosmeticKind, id: string): string {
  if (!catalog) return id;
  switch (kind) {
    case "badge":
      return catalog.badges.find((item) => item.id === id)?.name ?? id;
    case "title":
      return catalog.titles.find((item) => item.id === id)?.label ?? id;
    case "frame":
      return catalog.frames.find((item) => item.id === id)?.label ?? id;
    case "background":
      return catalog.backgrounds.find((item) => item.id === id)?.label ?? id;
    case "character":
      return catalog.characters.find((item) => item.id === id)?.name ?? id;
  }
}

/** «рамка «Зазывала», значок «Огонёк»». */
export function rewardsText(catalog: AvatarCatalog | null, rewards: readonly CosmeticReward[]): string {
  return rewards.map((reward) => `${COSMETIC_KIND_LABEL[reward.kind]} «${cosmeticName(catalog, reward.kind, reward.id)}»`).join(", ");
}

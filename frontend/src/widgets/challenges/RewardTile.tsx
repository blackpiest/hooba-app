import { cosmeticName } from "@/features/challenges/reward-names";
import { COSMETIC_KIND_LABEL } from "@/features/challenges/condition-text";
import type { CosmeticReward } from "@/shared/api/challenges";
import { BadgeIcon, Icon, Tooltip } from "@/shared/ui";
import { useAvatarStore } from "@/stores/avatar-store";
import { BackgroundTileArt, FrameTileArt } from "@/widgets/profile-edit/cosmetic-tiles";

/** Мини-плитка награды (40px): иконка значка, миниатюра рамки или фона, голова персонажа, значок титула. */
export function RewardTile({ reward }: { reward: CosmeticReward }) {
  const catalog = useAvatarStore((s) => s.catalog);
  const name = cosmeticName(catalog, reward.kind, reward.id);
  let art = <Icon name="help" size="sm" className="text-muted" />;
  if (reward.kind === "badge") {
    const badge = catalog?.badges.find((item) => item.id === reward.id);
    if (badge) art = <BadgeIcon icon={badge.icon} size={28} />;
  } else if (reward.kind === "title") {
    const title = catalog?.titles.find((item) => item.id === reward.id);
    const badge = title?.badge ? catalog?.badges.find((item) => item.id === title.badge) : undefined;
    art = badge ? <BadgeIcon icon={badge.icon} size={20} /> : <span className="font-heading text-[10px] text-muted">Аа</span>;
  } else if (reward.kind === "frame") {
    const frame = catalog?.frames.find((item) => item.id === reward.id);
    if (frame) art = <FrameTileArt spec={frame} />;
  } else if (reward.kind === "background") {
    const background = catalog?.backgrounds.find((item) => item.id === reward.id);
    if (background) art = <BackgroundTileArt spec={background} />;
  } else {
    const character = catalog?.characters.find((item) => item.id === reward.id);
    if (character) art = <img src={character.head_url} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />;
  }
  return (
    <Tooltip content={`${COSMETIC_KIND_LABEL[reward.kind]} · ${name}`} plain>
      <span aria-label={`${COSMETIC_KIND_LABEL[reward.kind]} «${name}»`} className="relative grid size-10 shrink-0 place-items-center overflow-hidden border border-line-strong bg-bg outline-none">
        {art}
      </span>
    </Tooltip>
  );
}

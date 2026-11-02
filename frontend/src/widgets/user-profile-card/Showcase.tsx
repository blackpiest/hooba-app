import { BadgeIcon, Tooltip } from "@/shared/ui";
import type { ResolvedShowcase } from "@/stores/avatar-store";

/** Закреплённые значки поверх окна карточки; подсказка — имя значка. */
export function ShowcaseBadges({ showcase }: { showcase: ResolvedShowcase }) {
  if (showcase.badges.length === 0) {
    return null;
  }
  return (
    <>
      {showcase.badges.map((badge) => (
        <Tooltip key={badge.id} content={badge.name} plain>
          <span
            aria-label={badge.name}
            className="grid size-7 place-items-center border border-white/15 bg-bg/80 outline-none focus-visible:[outline:var(--ds-focus-ring)]"
          >
            <BadgeIcon icon={badge.icon} size={20} />
          </span>
        </Tooltip>
      ))}
    </>
  );
}

/** Титул второй строкой таблички с именем. */
export function ShowcaseTitle({ showcase }: { showcase: ResolvedShowcase }) {
  if (!showcase.title) {
    return null;
  }
  return (
    <>
      {showcase.titleBadge ? <BadgeIcon icon={showcase.titleBadge.icon} size={12} /> : null}
      <span className="truncate">{showcase.title.label}</span>
    </>
  );
}

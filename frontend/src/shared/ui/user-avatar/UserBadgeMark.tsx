import { BadgeIcon } from "@/shared/ui/badge-icon";
import { Tooltip } from "@/shared/ui/tooltip/Tooltip";
import { useShowcase } from "@/stores/avatar-store";
import { cx } from "@/utils/cx";

/** Первый закреплённый значок участника рядом с ником (список участников, чат). Нет значка — ничего. */
export function UserBadgeMark({ userId, size = 16, className }: { userId: number; size?: number; className?: string }) {
  const badge = useShowcase(userId).badges[0];
  if (!badge) {
    return null;
  }
  return (
    <Tooltip content={badge.name} plain>
      <span aria-label={badge.name} className={cx("inline-flex shrink-0 self-center outline-none", className)}>
        <BadgeIcon icon={badge.icon} size={size} />
      </span>
    </Tooltip>
  );
}

import {
  CONDITION_HINT,
  describeCondition,
  formatLocalHour,
  formatProgress,
  type ConditionNames,
} from "@/features/challenges/condition-text";
import { useConditionNames } from "@/features/challenges/use-condition-names";
import {
  isConditionGroup,
  type ConditionNode,
  type MyChallenge,
  type NodeProgress,
} from "@/shared/api/challenges";
import { Badge, Icon, Progress, Tooltip } from "@/shared/ui";
import { cx } from "@/utils/cx";
import { RewardTile } from "./RewardTile";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU");
}

function StatusBadge({ challenge }: { challenge: MyChallenge }) {
  if (challenge.completed_at) {
    return <Badge variant="success">Выполнено {formatDate(challenge.completed_at)}</Badge>;
  }
  if (challenge.window === "ended") {
    return <Badge>Закончилось</Badge>;
  }
  if (challenge.window === "upcoming" && challenge.starts_at) {
    return <Badge variant="warning">Начнётся с {formatLocalHour(challenge.starts_at)}</Badge>;
  }
  return challenge.ends_at ? <Badge variant="brand">Доступно до {formatLocalHour(challenge.ends_at)}</Badge> : <Badge variant="brand">Сейчас активно</Badge>;
}

/** Строка условия: формулировка, подсказка «как считается», полоса и «72 / 100». */
function ConditionRow({ progress, names }: { progress: NodeProgress; names: ConditionNames }) {
  if ("op" in progress) {
    return (
      <div className="flex flex-col gap-2 border-l-2 border-line pl-3">
        <span className="text-[11px] text-muted">{progress.op === "any" ? "Любое из:" : "Всё из:"}</span>
        {progress.items.map((item, i) => (
          <ConditionRow key={i} progress={item} names={names} />
        ))}
      </div>
    );
  }
  const hint = CONDITION_HINT[progress.condition.type];
  const percent = Math.round((progress.current / progress.target) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className={cx("flex min-w-0 items-center gap-1.5", progress.done ? "text-fg" : "text-muted")}>
          {progress.done ? <Icon name="check" size="xs" className="shrink-0 text-success" /> : null}
          <span>{describeCondition(progress.condition, names)}</span>
          {hint ? (
            <Tooltip content={hint} plain>
              <span className="shrink-0 text-muted outline-none" aria-label={hint}>
                <Icon name="info" size="xs" />
              </span>
            </Tooltip>
          ) : null}
        </span>
        <span className="shrink-0 font-label text-[10px] text-fg">
          {formatProgress(progress.condition, progress.current, progress.target)}
        </span>
      </div>
      <Progress value={percent} tone={progress.done ? "success" : "brand"} aria-label={describeCondition(progress.condition, names)} />
    </div>
  );
}

/** Выполненное испытание: условия без прогресса, с галочками. */
function ConditionList({ node, names }: { node: ConditionNode; names: ConditionNames }) {
  if (isConditionGroup(node)) {
    return (
      <ul className="flex flex-col gap-1">
        {node.items.map((item, i) => (
          <li key={i}>
            <ConditionList node={item} names={names} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <Icon name="check" size="xs" className="shrink-0 text-success" />
      {describeCondition(node, names)}
    </span>
  );
}

/** Карточка испытания для участника: название, статус, награды и прогресс по каждому условию. `isNew` — метка «Новое». */
export function ChallengeCard({
  challenge,
  isNew,
  className,
}: {
  challenge: MyChallenge;
  isNew?: boolean;
  className?: string;
}) {
  const names = useConditionNames();
  const progress = challenge.progress;
  return (
    <article className={cx("flex flex-col gap-3 border border-line bg-surface p-3", challenge.completed_at && "border-success/40", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-heading text-sm leading-tight text-fg">{challenge.title}</h3>
          {challenge.description ? <p className="text-xs leading-relaxed text-muted">{challenge.description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {isNew ? <Badge variant="live">Новое</Badge> : null}
          <StatusBadge challenge={challenge} />
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-label text-[9px] uppercase tracking-[0.1em] text-muted">Награда</span>
        {challenge.rewards.map((reward) => (
          <RewardTile key={`${reward.kind}:${reward.id}`} reward={reward} />
        ))}
      </div>
      {progress ? (
        <div className="flex flex-col gap-3">
          {progress.op === "any" && progress.items.length > 1 ? (
            <span className="text-[11px] text-muted">Достаточно выполнить любое условие</span>
          ) : null}
          {progress.items.map((item, i) => (
            <ConditionRow key={i} progress={item} names={names} />
          ))}
        </div>
      ) : challenge.condition ? (
        <ConditionList node={challenge.condition} names={names} />
      ) : null}
    </article>
  );
}

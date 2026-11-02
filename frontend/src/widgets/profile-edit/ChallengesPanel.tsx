import { useMemo } from "react";
import type { MyChallenge } from "@/shared/api/challenges";
import { Alert, EmptyState, Spinner } from "@/shared/ui";
import { LABEL } from "@/shared/ui/text-field/field-styles";
import { useChallengeStore } from "@/stores/challenge-store";
import { ChallengeCard } from "@/widgets/challenges/ChallengeCard";

/** Порядок: идущие, скоро, выполненные, закончившиеся. */
function rank(challenge: MyChallenge): number {
  if (challenge.completed_at) return 2;
  return { open: 0, upcoming: 1, ended: 3 }[challenge.window];
}

/**
 * Вкладка «Испытания» конструктора: все испытания сообщества с моим прогрессом.
 * `fresh` — новые для меня (метка «Новое», внутри своей группы — первыми).
 */
export function ChallengesPanel({ fresh }: { fresh?: ReadonlySet<number> }) {
  const mine = useChallengeStore((s) => s.mine);
  const failed = useChallengeStore((s) => s.failed);
  const sorted = useMemo(
    () =>
      [...(mine ?? [])].sort(
        (a, b) => rank(a) - rank(b) || Number(fresh?.has(b.id) ?? false) - Number(fresh?.has(a.id) ?? false),
      ),
    [mine, fresh],
  );
  if (!mine) {
    return failed ? (
      <Alert tone="danger" compact>
        Не удалось загрузить испытания.
      </Alert>
    ) : (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (sorted.length === 0) {
    return <EmptyState title="Испытаний пока нет" description="Когда владелец сервера их придумает, они появятся здесь." />;
  }
  return (
    <div className="flex flex-col gap-3">
      {sorted.map((challenge) => (
        <ChallengeCard key={challenge.id} challenge={challenge} isNew={fresh?.has(challenge.id)} />
      ))}
    </div>
  );
}

/**
 * Под сеткой косметики: как открыть выбранный закрытый предмет — карточки испытаний, которые его дают.
 * Открытый или невыбранный предмет — ничего. Испытание завершено — пишем, что предмет сейчас не выдаётся.
 */
export function LockedHowTo({ item }: { item: { label: string; locked: boolean; challengeIds: number[] } | undefined }) {
  const mine = useChallengeStore((s) => s.mine);
  if (!item?.locked) {
    return null;
  }
  const cards = item.challengeIds.flatMap((id) => {
    const challenge = mine?.find((row) => row.id === id && row.window !== "ended" && !row.completed_at);
    return challenge ? [challenge] : [];
  });
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>Как открыть «{item.label}»</span>
      {cards.map((challenge) => (
        <ChallengeCard key={challenge.id} challenge={challenge} />
      ))}
      {mine && cards.length === 0 ? (
        <span className="text-xs text-muted">Сейчас не выдаётся: испытание завершено.</span>
      ) : null}
    </div>
  );
}

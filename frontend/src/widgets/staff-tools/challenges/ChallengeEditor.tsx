import { useMemo, useState } from "react";
import { CONDITION_LABEL, describeCondition, type ConditionNames } from "@/features/challenges/condition-text";
import { cosmeticName, rewardsText } from "@/features/challenges/reward-names";
import {
  archiveChallenge,
  createChallenge,
  deleteChallenge,
  isConditionGroup,
  publishChallenge,
  updateChallenge,
  type Challenge,
  type ChallengeInput,
  type Condition,
  type ConditionNode,
  type ConditionType,
  type CosmeticKind,
  type CosmeticReward,
  type MyChallenge,
} from "@/shared/api/challenges";
import { formatApiError } from "@/shared/api/format-error";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  FieldGroup,
  DropdownMenu,
  IconButton,
  MenuItem,
  MenuSection,
  SectionLabel,
  SegmentedControl,
  Tag,
  Textarea,
  TextField,
} from "@/shared/ui";
import { useAvatarStore } from "@/stores/avatar-store";
import { useChannelStore } from "@/stores/channel-store";
import { ChallengeCard } from "@/widgets/challenges/ChallengeCard";
import { EditorFooter, EditorHeader } from "../panel-layout";
import { CHALLENGE_STATUS } from "./challenge-status";
import { ConditionCard } from "./ConditionCard";
import { LocalHourField } from "./fields";

/** Каталог условий в меню «Добавить условие». */
const CONDITION_MENU: { label: string; types: ConditionType[] }[] = [
  { label: "Активность", types: ["voice_minutes", "active_days", "streak_days", "online_minutes", "game_minutes"] },
  { label: "Общение", types: ["messages"] },
  { label: "Сообщество", types: ["invites_joined"] },
  { label: "Особые", types: ["has_cosmetic", "challenge_done"] },
];

const REWARD_KINDS: { kind: CosmeticKind; label: string }[] = [
  { kind: "frame", label: "Рамки" },
  { kind: "background", label: "Фоны" },
  { kind: "character", label: "Персонажи" },
  { kind: "badge", label: "Значки" },
  { kind: "title", label: "Титулы" },
];

/** Сегодня 20:00 по часам браузера — разумная заготовка окна «события». */
function tonightAt(hour: number, plusDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + plusDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`;
}

function newCondition(type: ConditionType): Condition {
  switch (type) {
    case "messages":
      return { type, count: 100 };
    case "voice_minutes":
      return { type, minutes: 300 };
    case "game_minutes":
      return { type, minutes: 600 };
    case "online_minutes":
      return { type, minutes: 60, from: tonightAt(20), to: tonightAt(22) };
    case "active_days":
      return { type, days: 7 };
    case "streak_days":
      return { type, days: 3 };
    case "invites_joined":
      return { type, count: 1 };
    case "has_cosmetic":
      return { type, kind: "badge", item_id: "" };
    case "challenge_done":
      return { type, challenge_id: 0 };
  }
}

function leafTarget(condition: Condition): number {
  switch (condition.type) {
    case "messages":
    case "invites_joined":
      return condition.count;
    case "voice_minutes":
    case "game_minutes":
    case "online_minutes":
      return condition.minutes;
    case "active_days":
    case "streak_days":
      return condition.days;
    default:
      return 1;
  }
}

/** Что не так с черновиком до отправки на сервер (сервер всё равно проверит). */
function draftProblem(title: string, rewards: CosmeticReward[], items: ConditionNode[]): string | null {
  if (!title.trim()) return "Нужно название";
  if (rewards.length === 0) return "Нужна хотя бы одна награда";
  if (items.length === 0) return "Нужно хотя бы одно условие";
  for (const node of items) {
    if (isConditionGroup(node)) continue;
    if (node.type === "has_cosmetic" && !node.item_id) return "Выберите предмет в условии «Есть предмет»";
    if (node.type === "challenge_done" && !node.challenge_id) return "Выберите испытание в условии «Другое испытание»";
  }
  return null;
}

/**
 * Редактор испытания (только владелец). Условия — плоский список с режимом «все / любое»;
 * вложенные группы (если пришли из API) показываются как есть и удаляются целиком.
 */
export function ChallengeEditor({
  challenge,
  challenges,
  onSaved,
  onBack,
}: {
  challenge: Challenge | null;
  challenges: Challenge[];
  onSaved: (row: Challenge | null) => void;
  onBack: () => void;
}) {
  const catalog = useAvatarStore((s) => s.catalog);
  const channels = useChannelStore((s) => s.channels);
  const [title, setTitle] = useState(challenge?.title ?? "");
  const [description, setDescription] = useState(challenge?.description ?? "");
  const [rewards, setRewards] = useState<CosmeticReward[]>(challenge?.rewards ?? []);
  const [op, setOp] = useState<"all" | "any">(challenge?.condition?.op ?? "all");
  const [items, setItems] = useState<ConditionNode[]>(challenge?.condition?.items ?? []);
  const [startsAt, setStartsAt] = useState<string | null>(challenge?.starts_at ?? null);
  const [endsAt, setEndsAt] = useState<string | null>(challenge?.ends_at ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"publish" | "archive" | "delete" | null>(null);
  const status = challenge?.status ?? "draft";
  const others = challenges.filter((row) => row.id !== challenge?.id);

  const names: ConditionNames = useMemo(
    () => ({
      channel: (id) => channels.find((channel) => channel.id === id)?.name,
      cosmetic: (kind, id) => cosmeticName(catalog, kind, id),
      challenge: (id) => challenges.find((row) => row.id === id)?.title,
    }),
    [channels, catalog, challenges],
  );

  const input: ChallengeInput = {
    title: title.trim(),
    description: description.trim(),
    condition: { op, items },
    rewards,
    starts_at: startsAt,
    ends_at: endsAt,
  };

  /** Превью для участника: тот же `ChallengeCard`, прогресс по нулям. */
  const preview: MyChallenge = {
    id: challenge?.id ?? 0,
    title: input.title || "Без названия",
    description: input.description,
    status: "active",
    condition: input.condition,
    rewards,
    starts_at: startsAt,
    ends_at: endsAt,
    window: "open",
    completed_at: null,
    progress: {
      op,
      ratio: 0,
      done: false,
      items: items.flatMap((node) =>
        isConditionGroup(node) ? [] : [{ condition: node, current: 0, target: leafTarget(node), done: false }],
      ),
    },
  };

  async function run(action: () => Promise<Challenge | null>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const row = await action();
      onSaved(row);
      after?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message, "Не удалось сохранить") : "Не удалось сохранить");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  function save(): Promise<Challenge> {
    return challenge ? updateChallenge(challenge.id, input) : createChallenge(input);
  }

  function trySave(then?: (row: Challenge) => Promise<Challenge | null>) {
    const problem = draftProblem(title, rewards, items);
    if (problem) {
      setError(problem);
      setConfirm(null);
      return;
    }
    void run(async () => {
      const saved = await save();
      return then ? then(saved) : saved;
    });
  }

  const usedRewards = new Set(rewards.map((r) => `${r.kind}:${r.id}`));

  return (
    <div className="flex flex-col gap-5">
      <EditorHeader
        title={challenge ? challenge.title : "Новое испытание"}
        backLabel="К списку испытаний"
        onBack={onBack}
        status={<Badge variant={CHALLENGE_STATUS[status].variant}>{CHALLENGE_STATUS[status].label}</Badge>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <TextField label="Название" value={title} maxLength={60} isDisabled={busy} onChange={setTitle} placeholder="Ночная легенда" />
          <Textarea label="Описание" value={description} maxLength={300} rows={2} isDisabled={busy} onChange={setDescription} />

          <FieldGroup
            title="Награды"
            description="Получит каждый, кто выполнит. Рамка, фон или персонаж из награды закроются для остальных; кто носит их сейчас — сохранит."
          >
            <div className="flex flex-wrap items-center gap-2">
              {rewards.map((reward) => (
                <Tag key={`${reward.kind}:${reward.id}`} removeLabel="Убрать награду" onRemove={busy ? undefined : () => setRewards(rewards.filter((r) => r !== reward))}>
                  {rewardsText(catalog, [reward])}
                </Tag>
              ))}
              <DropdownMenu
                aria-label="Добавить награду"
                trigger={
                  <Button variant="secondary" size="sm" leadingIcon="plus" isDisabled={busy || rewards.length >= 5}>
                    Награда
                  </Button>
                }
                onAction={(key) => {
                  const [kind, id] = String(key).split(":") as [CosmeticKind, string];
                  setRewards([...rewards, { kind, id }]);
                }}
              >
                {REWARD_KINDS.map(({ kind, label }) => {
                  const list: { id: string }[] = catalog
                    ? (kind === "badge"
                        ? catalog.badges.filter((badge) => badge.category !== "role")
                        : { title: catalog.titles, frame: catalog.frames, background: catalog.backgrounds, character: catalog.characters }[kind])
                    : [];
                  return (
                    <MenuSection key={kind} label={label}>
                      {list
                        .filter((item) => !usedRewards.has(`${kind}:${item.id}`))
                        .map((item) => (
                          <MenuItem key={`${kind}:${item.id}`} id={`${kind}:${item.id}`}>
                            {cosmeticName(catalog, kind, item.id)}
                          </MenuItem>
                        ))}
                    </MenuSection>
                  );
                })}
              </DropdownMenu>
            </div>
          </FieldGroup>

          <FieldGroup
            title="Когда идёт испытание"
            description="Необязательно. По часам сервера; условия считают только активность внутри этого окна."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <LocalHourField label="Начало" value={startsAt} isDisabled={busy} onChange={setStartsAt} />
              <LocalHourField label="Конец" value={endsAt} isDisabled={busy} onChange={setEndsAt} />
            </div>
          </FieldGroup>

          <FieldGroup
            title="Условия"
            aside={
              <SegmentedControl
                aria-label="Как засчитывать условия"
                value={op}
                isDisabled={busy}
                onChange={(value) => setOp(value as "all" | "any")}
                options={[
                  { value: "all", label: "Выполнить все" },
                  { value: "any", label: "Достаточно любого" },
                ]}
              />
            }
          >
            {items.map((node, index) =>
              isConditionGroup(node) ? (
                <div key={index} className="flex items-start justify-between gap-3 border border-dashed border-line-strong p-3 text-xs text-muted">
                  <span>
                    Группа ({node.op === "all" ? "все" : "любое"}):{" "}
                    {node.items.map((item) => (isConditionGroup(item) ? "группа" : describeCondition(item, names))).join("; ")}
                  </span>
                  <IconButton icon="trash" label="Убрать группу" variant="danger" className="-mr-1 -mt-1" isDisabled={busy} onPress={() => setItems(items.filter((_, i) => i !== index))} />
                </div>
              ) : (
                <ConditionCard
                  key={index}
                  condition={node}
                  names={names}
                  challenges={others}
                  isDisabled={busy}
                  onChange={(next) => setItems(items.map((item, i) => (i === index ? next : item)))}
                  onRemove={() => setItems(items.filter((_, i) => i !== index))}
                />
              ),
            )}
            <DropdownMenu
              aria-label="Добавить условие"
              trigger={
                <Button variant="secondary" size="sm" leadingIcon="plus" className="self-start" isDisabled={busy || items.length >= 10}>
                  Добавить условие
                </Button>
              }
              onAction={(key) => setItems([...items, newCondition(key as ConditionType)])}
            >
              {CONDITION_MENU.map((group) => (
                <MenuSection key={group.label} label={group.label}>
                  {group.types
                    .filter((type) => type !== "challenge_done" || others.length > 0)
                    .map((type) => (
                      <MenuItem key={type} id={type}>
                        {CONDITION_LABEL[type]}
                      </MenuItem>
                    ))}
                </MenuSection>
              ))}
            </DropdownMenu>
          </FieldGroup>
        </div>

        <div className="flex flex-col gap-2 lg:sticky lg:top-0">
          <SectionLabel>Так увидит участник</SectionLabel>
          <ChallengeCard challenge={preview} />
        </div>
      </div>

      {error ? (
        <Alert tone="danger" compact>
          {error}
        </Alert>
      ) : null}

      <EditorFooter>
        {challenge && status === "draft" ? (
          <Button variant="danger-ghost" leadingIcon="trash" className="mr-auto" isDisabled={busy} onPress={() => setConfirm("delete")}>
            Удалить
          </Button>
        ) : null}
        {challenge && status === "active" ? (
          <Button variant="ghost" className="mr-auto" isDisabled={busy} onPress={() => setConfirm("archive")}>
            В архив
          </Button>
        ) : null}
        <Button variant={status === "draft" ? "secondary" : "primary"} isPending={busy} onPress={() => trySave()}>
          {status === "draft" ? "Сохранить черновик" : "Сохранить"}
        </Button>
        {status === "draft" ? (
          <Button isDisabled={busy} onPress={() => setConfirm("publish")}>
            Опубликовать
          </Button>
        ) : null}
      </EditorFooter>

      <ConfirmDialog
        isOpen={confirm === "publish"}
        onClose={() => setConfirm(null)}
        title="Опубликовать испытание?"
        description="Участники увидят его и свой прогресс. Те, кто уже выполнил условия (например, по истории сообщений), получат награду сразу. Награды-рамки, фоны и персонажи закроются для остальных."
        confirmLabel="Опубликовать"
        isPending={busy}
        onConfirm={() => trySave((row) => publishChallenge(row.id))}
      />
      <ConfirmDialog
        isOpen={confirm === "archive"}
        onClose={() => setConfirm(null)}
        title="Отправить в архив?"
        description="Испытание перестанет засчитываться. Награды останутся у получивших, а закрытые предметы — закрытыми для остальных."
        confirmLabel="В архив"
        isPending={busy}
        onConfirm={() => challenge && void run(() => archiveChallenge(challenge.id))}
      />
      <ConfirmDialog
        isOpen={confirm === "delete"}
        onClose={() => setConfirm(null)}
        tone="danger"
        title="Удалить черновик?"
        confirmLabel="Удалить"
        isPending={busy}
        onConfirm={() =>
          challenge &&
          void run(async () => {
            await deleteChallenge(challenge.id);
            return null;
          }, onBack)
        }
      />
    </div>
  );
}

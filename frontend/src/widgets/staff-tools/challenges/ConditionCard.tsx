import type { ReactNode } from "react";
import { COSMETIC_KIND_LABEL, CONDITION_HINT, CONDITION_LABEL, describeCondition, type ConditionNames } from "@/features/challenges/condition-text";
import { cosmeticName } from "@/features/challenges/reward-names";
import type { Challenge, Condition, CosmeticKind } from "@/shared/api/challenges";
import { IconButton, SectionLabel, Select, TextField } from "@/shared/ui";
import { CheckList, CheckListItem } from "@/shared/ui/check-list";
import { useAvatarStore } from "@/stores/avatar-store";
import { useChannelStore } from "@/stores/channel-store";
import { AmountField, LocalHourField } from "./fields";

const KINDS: CosmeticKind[] = ["frame", "background", "character", "badge", "title"];

/** Две колонки на широком экране: одиночное поле занимает половину, как поля периода под ним. */
function FieldPair({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-3 sm:grid-cols-2">{children}</div>;
}

/** Каналы нужного типа галочками; ничего не отмечено — считаются все. */
function ChannelPicker({
  channelType,
  value,
  onChange,
  isDisabled,
}: {
  channelType: "TEXT" | "VOICE";
  value: number[] | undefined;
  onChange: (next: number[] | undefined) => void;
  isDisabled?: boolean;
}) {
  const channels = useChannelStore((s) => s.channels).filter((channel) => channel.channel_type === channelType);
  const picked = new Set(value ?? []);
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel className="tracking-[0.06em]">Каналы</SectionLabel>
      <CheckList className="max-h-32">
        {channels.map((channel) => (
          <CheckListItem
            key={channel.id}
            checked={picked.has(channel.id)}
            disabled={isDisabled}
            onChange={(on) => {
              const next = on ? [...picked, channel.id] : [...picked].filter((id) => id !== channel.id);
              onChange(next.length > 0 ? next : undefined);
            }}
          >
            #{channel.name}
          </CheckListItem>
        ))}
      </CheckList>
      <p className="text-[11px] leading-relaxed text-muted">Ничего не отмечено — считаются все каналы.</p>
    </div>
  );
}

/** Период условия внутри окна испытания; у «Онлайн в период» обязателен. */
function PeriodFields({
  condition,
  onChange,
  isRequired,
  isDisabled,
}: {
  condition: { from?: string; to?: string };
  onChange: (patch: { from?: string; to?: string }) => void;
  isRequired?: boolean;
  isDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldPair>
        <LocalHourField
          label="Считать с"
          value={condition.from}
          isRequired={isRequired}
          isDisabled={isDisabled}
          onChange={(from) => onChange({ from: from ?? undefined })}
        />
        <LocalHourField
          label="по"
          value={condition.to}
          isRequired={isRequired}
          isDisabled={isDisabled}
          onChange={(to) => onChange({ to: to ?? undefined })}
        />
      </FieldPair>
      {isRequired ? null : (
        <p className="text-[11px] leading-relaxed text-muted">Период необязателен: без него считается всё окно испытания.</p>
      )}
    </div>
  );
}

/** Часы с точностью до минуты: поле в часах (можно 1.5), в условии — минуты. */
function HoursField({ minutes, onChange, isDisabled }: { minutes: number; onChange: (m: number) => void; isDisabled?: boolean }) {
  return (
    <TextField
      label="Сколько часов"
      defaultValue={String(Math.round((minutes / 60) * 100) / 100)}
      inputMode="decimal"
      isDisabled={isDisabled}
      onChange={(text) => {
        const hours = Number(text.replace(",", "."));
        if (Number.isFinite(hours) && hours > 0) {
          onChange(Math.max(1, Math.round(hours * 60)));
        }
      }}
    />
  );
}

/** Параметры условия: у каждого типа своя небольшая форма. */
function ConditionFields({
  condition,
  onChange,
  challenges,
  isDisabled,
}: {
  condition: Condition;
  onChange: (next: Condition) => void;
  challenges: Challenge[];
  isDisabled?: boolean;
}) {
  const catalog = useAvatarStore((s) => s.catalog);
  const patch = (p: Partial<Condition>) => onChange({ ...condition, ...p } as Condition);
  switch (condition.type) {
    case "messages":
      return (
        <>
          <FieldPair>
            <AmountField label="Сколько сообщений" value={condition.count} max={1_000_000} isDisabled={isDisabled} onChange={(count) => patch({ count })} />
          </FieldPair>
          <ChannelPicker channelType="TEXT" value={condition.channel_ids} isDisabled={isDisabled} onChange={(channel_ids) => patch({ channel_ids })} />
          <PeriodFields condition={condition} isDisabled={isDisabled} onChange={patch} />
        </>
      );
    case "voice_minutes":
      return (
        <>
          <FieldPair>
            <HoursField minutes={condition.minutes} isDisabled={isDisabled} onChange={(minutes) => patch({ minutes })} />
          </FieldPair>
          <ChannelPicker channelType="VOICE" value={condition.channel_ids} isDisabled={isDisabled} onChange={(channel_ids) => patch({ channel_ids })} />
          <PeriodFields condition={condition} isDisabled={isDisabled} onChange={patch} />
        </>
      );
    case "game_minutes":
      return (
        <>
          <FieldPair>
            <HoursField minutes={condition.minutes} isDisabled={isDisabled} onChange={(minutes) => patch({ minutes })} />
            <TextField
              label="Игры"
              placeholder="Пусто — любые игры"
              hint="Через запятую, как в «Играет в …»"
              defaultValue={condition.games?.join(", ") ?? ""}
              isDisabled={isDisabled}
              onChange={(text) => {
                const games = text.split(",").map((game) => game.trim()).filter(Boolean);
                patch({ games: games.length > 0 ? games : undefined });
              }}
            />
          </FieldPair>
          <PeriodFields condition={condition} isDisabled={isDisabled} onChange={patch} />
        </>
      );
    case "online_minutes":
      return (
        <>
          <FieldPair>
            <AmountField label="Сколько минут" value={condition.minutes} max={100_000} isDisabled={isDisabled} onChange={(minutes) => patch({ minutes })} />
          </FieldPair>
          <PeriodFields condition={condition} isRequired isDisabled={isDisabled} onChange={patch} />
        </>
      );
    case "active_days":
      return (
        <>
          <FieldPair>
            <AmountField label="Сколько дней" value={condition.days} max={3650} isDisabled={isDisabled} onChange={(days) => patch({ days })} />
          </FieldPair>
          <PeriodFields condition={condition} isDisabled={isDisabled} onChange={patch} />
        </>
      );
    case "streak_days":
      return (
        <FieldPair>
          <AmountField label="Дней подряд" value={condition.days} min={2} max={3650} isDisabled={isDisabled} onChange={(days) => patch({ days })} />
        </FieldPair>
      );
    case "invites_joined":
      return (
        <FieldPair>
          <AmountField label="Сколько участников" value={condition.count} max={100} isDisabled={isDisabled} onChange={(count) => patch({ count })} />
        </FieldPair>
      );
    case "has_cosmetic": {
      const list: { id: string }[] = catalog
        ? { badge: catalog.badges, title: catalog.titles, frame: catalog.frames, background: catalog.backgrounds, character: catalog.characters }[condition.kind]
        : [];
      return (
        <FieldPair>
          <Select
            label="Вид"
            value={condition.kind}
            isDisabled={isDisabled}
            options={KINDS.map((kind) => ({ value: kind, label: COSMETIC_KIND_LABEL[kind] }))}
            onChange={(kind) => patch({ kind: kind as CosmeticKind, item_id: "" })}
          />
          <Select
            label="Предмет"
            value={condition.item_id || null}
            isDisabled={isDisabled}
            options={list.map((item) => ({ value: item.id, label: cosmeticName(catalog, condition.kind, item.id) }))}
            onChange={(item_id) => patch({ item_id })}
          />
        </FieldPair>
      );
    }
    case "challenge_done":
      return (
        <FieldPair>
          <Select
            label="Испытание"
            value={condition.challenge_id ? String(condition.challenge_id) : null}
            isDisabled={isDisabled}
            options={challenges.map((challenge) => ({ value: String(challenge.id), label: challenge.title }))}
            onChange={(id) => patch({ challenge_id: Number(id) })}
          />
        </FieldPair>
      );
  }
}

/** Карточка условия в редакторе: шапка (тип, итоговая формулировка, как считается) и поля под чертой. */
export function ConditionCard({
  condition,
  names,
  challenges,
  onChange,
  onRemove,
  isDisabled,
  footer,
}: {
  condition: Condition;
  names: ConditionNames;
  challenges: Challenge[];
  onChange: (next: Condition) => void;
  onRemove: () => void;
  isDisabled?: boolean;
  footer?: ReactNode;
}) {
  const hint = CONDITION_HINT[condition.type];
  return (
    <div className="flex flex-col border border-line bg-bg">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <SectionLabel>{CONDITION_LABEL[condition.type]}</SectionLabel>
          <p className="text-sm text-fg">{describeCondition(condition, names)}</p>
          {hint ? <p className="text-[11px] leading-relaxed text-muted">{hint}</p> : null}
        </div>
        <IconButton icon="trash" label="Убрать условие" variant="danger" className="-mr-1 -mt-1" isDisabled={isDisabled} onPress={onRemove} />
      </div>
      <div className="flex flex-col gap-4 border-t border-line p-3">
        <ConditionFields condition={condition} challenges={challenges} isDisabled={isDisabled} onChange={onChange} />
        {footer}
      </div>
    </div>
  );
}

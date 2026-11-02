import type { RoleRow } from "@/shared/api/roles";
import { CheckList, CheckListItem } from "@/shared/ui/check-list";
import { RoleBadge, SectionLabel, SegmentedControl } from "@/shared/ui";

/** null — действие доступно всем, набор — только выбранным ролям. */
export type RoleRuleValue = Set<number> | null;

/** Выбор людей вдобавок к ролям (правило реакций). */
export type RulePeople = {
  /** Без OWNER/ADMIN — им ограничения не мешают. */
  members: { id: number; name: string }[];
  value: Set<number>;
  onChange: (next: Set<number>) => void;
};

function toggled(set: Set<number>, id: number, on: boolean): Set<number> {
  const next = new Set(set);
  if (on) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
}

/** «Кто может …»: все или выбранные роли (и люди, если передан `people`). Владелец и администраторы могут всегда. */
export function ChannelRoleRule({
  title,
  value,
  roles,
  people,
  disabled,
  onChange,
}: {
  title: string;
  value: RoleRuleValue;
  /** Роли, из которых выбираем (без OWNER/ADMIN — им ограничения не мешают). */
  roles: RoleRow[];
  people?: RulePeople;
  disabled: boolean;
  onChange: (next: RoleRuleValue) => void;
}) {
  const restricted = value !== null;
  const nobody = (value?.size ?? 0) === 0 && (people?.value.size ?? 0) === 0;

  function toggle(roleId: number, on: boolean) {
    onChange(toggled(value ?? new Set(), roleId, on));
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2">
        <SectionLabel>{title}</SectionLabel>
      </legend>
      <SegmentedControl
        className="self-start"
        aria-label={title}
        value={restricted ? "roles" : "all"}
        isDisabled={disabled}
        onChange={(next) => onChange(next === "all" ? null : (value ?? new Set()))}
        options={[
          { value: "all", label: "Все" },
          { value: "roles", label: people ? "Выбранные" : "Выбранные роли" },
        ]}
      />
      {restricted ? (
        <>
          {people ? <p className="mt-1 text-xs font-medium text-fg">Роли</p> : null}
          <CheckList className="max-h-40">
            {roles.map((role) => (
              <CheckListItem
                key={role.id}
                checked={value.has(role.id)}
                disabled={disabled}
                onChange={(on) => toggle(role.id, on)}
                trailing={<RoleBadge color={role.color ?? "transparent"} />}
              >
                {role.name}
              </CheckListItem>
            ))}
          </CheckList>
          {people ? (
            <>
              <p className="mt-1 text-xs font-medium text-fg">Люди</p>
              <CheckList className="max-h-40">
                {people.members.map((member) => (
                  <CheckListItem
                    key={member.id}
                    checked={people.value.has(member.id)}
                    disabled={disabled}
                    onChange={(on) => people.onChange(toggled(people.value, member.id, on))}
                  >
                    {member.name}
                  </CheckListItem>
                ))}
              </CheckList>
            </>
          ) : null}
          <p className="text-xs text-muted">
            {nobody ? "Никто, кроме владельца и администраторов." : "Владелец и администраторы могут всегда."}
          </p>
        </>
      ) : null}
    </fieldset>
  );
}

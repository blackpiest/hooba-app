import { useEffect, useMemo, useState } from "react";
import {
  createChannelApi,
  fetchChannelById,
  updateChannelApi,
  type ChannelDto,
  type ChannelWriteInput,
} from "@/shared/api/channels";
import { formatApiError } from "@/shared/api/format-error";
import { CheckList, CheckListItem } from "@/shared/ui/check-list";
import { Alert, Button, Modal, RoleBadge, SectionLabel, SettingRow, Spinner, Switch, TextField } from "@/shared/ui";
import type { UserDirectoryEntry } from "@/shared/api/users";
import { displayNameOf } from "@/shared/lib/display-name";
import { useRoleStore } from "@/stores/role-store";
import { ChannelRoleRule, type RoleRuleValue } from "./ChannelRoleRule";

/** Зеркало `CHANNEL_NAME_MAX` на бэкенде. */
const CHANNEL_NAME_MAX = 24;

type ChannelKind = "TEXT" | "VOICE";

type RuleKey = "send" | "speak" | "stream" | "attach" | "react";

/** Что ограничивается в канале этого типа (сервер отклонит остальное). */
const RULES_FOR_KIND: Record<ChannelKind, { key: RuleKey; title: string }[]> = {
  TEXT: [
    { key: "send", title: "Кто может писать" },
    { key: "attach", title: "Кто может отправлять картинки" },
    { key: "react", title: "Кто может ставить реакции" },
  ],
  VOICE: [
    { key: "speak", title: "Кто может говорить" },
    { key: "stream", title: "Кто может проводить трансляцию" },
  ],
};

const NO_RULES: Record<RuleKey, RoleRuleValue> = { send: null, speak: null, stream: null, attach: null, react: null };

function ruleFrom(ids: number[] | null | undefined): RoleRuleValue {
  return ids == null ? null : new Set(ids);
}

export function ChannelSettingsDialog({
  channelType,
  channelId,
  members,
  meId,
  meUsername,
  onClose,
  onSaved,
}: {
  channelType: ChannelKind;
  /** Задан — редактирование, иначе создание. */
  channelId?: number;
  members: UserDirectoryEntry[];
  meId: number | null;
  meUsername: string | null;
  onClose: () => void;
  onSaved: (channel: ChannelDto) => void;
}) {
  const editing = channelId !== undefined;
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => (meId === null ? new Set() : new Set([meId])));
  const [rules, setRules] = useState<Record<RuleKey, RoleRuleValue>>(NO_RULES);
  /** Люди, которым реакции открыты вдобавок к ролям (когда реакции ограничены). */
  const [reactUsers, setReactUsers] = useState<Set<number>>(() => new Set());
  /** Роли, которые видят приватный канал (вдобавок к отмеченным людям). */
  const [viewRoles, setViewRoles] = useState<Set<number>>(() => new Set());
  const catalog = useRoleStore((s) => s.roles);
  // OWNER/ADMIN ограничения не касаются — выбирать их бессмысленно.
  const ruleRoles = useMemo(
    () => catalog.filter((role) => role.key !== "OWNER" && role.key !== "ADMIN"),
    [catalog],
  );
  const [loading, setLoading] = useState(editing);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (channelId === undefined) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchChannelById(channelId, { force: true })
      .then((channel) => {
        if (cancelled) {
          return;
        }
        setName(channel.name);
        setIsPrivate(channel.is_private);
        const ids = new Set(channel.member_user_ids ?? []);
        if (meId !== null) {
          ids.add(meId);
        }
        setSelected(ids);
        setViewRoles(new Set(channel.view_role_ids ?? []));
        setRules({
          send: ruleFrom(channel.send_role_ids),
          speak: ruleFrom(channel.speak_role_ids),
          stream: ruleFrom(channel.stream_role_ids),
          attach: ruleFrom(channel.attach_role_ids),
          react: ruleFrom(channel.react_role_ids),
        });
        setReactUsers(new Set(channel.react_user_ids ?? []));
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setLoading(false);
        setLoadFailed(true);
        setError(cause instanceof Error ? formatApiError(cause.message) : "Не удалось открыть канал");
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, meId]);

  // Правило реакций: людей из списка, кроме OWNER/ADMIN (им можно всегда).
  const rulePeople = useMemo(
    () =>
      members
        .filter((member) => !member.roles.includes("OWNER") && !member.roles.includes("ADMIN"))
        .map((member) => ({ id: member.id, name: displayNameOf(member) }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [members],
  );

  const people = useMemo(() => {
    const others = members
      .filter((member) => member.id !== meId)
      .slice()
      .sort((a, b) => a.username.localeCompare(b.username, "ru"));
    const self =
      members.find((member) => member.id === meId) ??
      (meId !== null && meUsername
        ? {
            id: meId,
            username: meUsername,
            roles: [],
            status: "online",
            is_online: true,
            last_seen_at: null,
            game: null,
          }
        : null);
    return self ? [self, ...others] : others;
  }, [members, meId, meUsername]);

  function toggleMember(userId: number) {
    if (userId === meId) {
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  async function onSubmit() {
    const nextName = name.trim();
    if (!nextName || busy || loading) {
      if (!nextName) {
        setError("Введите название");
      }
      return;
    }
    const input: ChannelWriteInput = {
      name: nextName,
      is_private: isPrivate,
      ...(isPrivate ? { member_user_ids: [...selected], view_role_ids: [...viewRoles] } : {}),
    };
    for (const { key } of RULES_FOR_KIND[channelType]) {
      const value = rules[key];
      input[`${key}_role_ids`] = value === null ? null : [...value];
    }
    if (channelType === "TEXT") {
      input.react_user_ids = rules.react === null ? [] : [...reactUsers];
    }
    setBusy(true);
    setError(null);
    try {
      const saved =
        channelId === undefined
          ? await createChannelApi(channelType, input)
          : await updateChannelApi(channelId, input);
      onSaved(saved);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? formatApiError(cause.message) : "Не удалось сохранить канал");
    } finally {
      setBusy(false);
    }
  }

  const title = editing
    ? "Редактировать канал"
    : channelType === "TEXT"
      ? "Новый текстовый канал"
      : "Новый голосовой канал";

  return (
    <Modal
      isOpen
      size="lg"
      title={title}
      isDismissable={!busy}
      onClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      footer={
        loading || loadFailed ? (
          <Button variant="ghost" onPress={onClose}>
            Закрыть
          </Button>
        ) : (
          <>
            <Button variant="ghost" isDisabled={busy} onPress={onClose}>
              Отмена
            </Button>
            <Button type="submit" form="channel-settings-form" isPending={busy} isDisabled={!name.trim()}>
              {editing ? "Сохранить" : "Создать"}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="flex min-h-24 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : loadFailed ? null : (
          <form
            id="channel-settings-form"
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            <TextField
              label="Название"
              aria-label="Название канала"
              value={name}
              onChange={setName}
              autoFocus
              maxLength={CHANNEL_NAME_MAX}
              isDisabled={busy}
            />

            <SettingRow
              bordered={false}
              title="Приватный канал"
              description="Будет виден только выбранным участникам и ролям"
            >
              <Switch aria-label="Приватный канал" isSelected={isPrivate} isDisabled={busy} onChange={setIsPrivate} />
            </SettingRow>

            {isPrivate ? (
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-1">
                  <SectionLabel>Кто видит канал</SectionLabel>
                </legend>
                <p className="text-xs text-muted">Отмеченные люди и все, у кого есть отмеченная роль.</p>
                <p className="mt-1 text-xs font-medium text-fg">Роли</p>
                <CheckList className="max-h-40">
                  {catalog.map((role) => (
                    <CheckListItem
                      key={role.id}
                      checked={viewRoles.has(role.id)}
                      disabled={busy}
                      onChange={(on) =>
                        setViewRoles((current) => {
                          const next = new Set(current);
                          if (on) {
                            next.add(role.id);
                          } else {
                            next.delete(role.id);
                          }
                          return next;
                        })
                      }
                      trailing={<RoleBadge color={role.color ?? "transparent"} />}
                    >
                      {role.name}
                    </CheckListItem>
                  ))}
                </CheckList>
                <p className="mt-1 text-xs font-medium text-fg">Люди</p>
                <CheckList>
                  {people.map((member) => {
                    const self = member.id === meId;
                    return (
                      <CheckListItem
                        key={member.id}
                        checked={self || selected.has(member.id)}
                        disabled={busy || self}
                        onChange={() => toggleMember(member.id)}
                        trailing={self ? "вы" : undefined}
                      >
                        {member.username}
                      </CheckListItem>
                    );
                  })}
                </CheckList>
              </fieldset>
            ) : null}

            {RULES_FOR_KIND[channelType].map(({ key, title }) => (
              <ChannelRoleRule
                key={key}
                title={title}
                value={rules[key]}
                roles={ruleRoles}
                people={
                  key === "react"
                    ? { members: rulePeople, value: reactUsers, onChange: setReactUsers }
                    : undefined
                }
                disabled={busy}
                onChange={(next) => setRules((current) => ({ ...current, [key]: next }))}
              />
            ))}
          </form>
        )}
        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
      </div>
    </Modal>
  );
}

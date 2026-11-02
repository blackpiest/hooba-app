import { memo, useCallback, useEffect, useRef, useState, type HTMLAttributes } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  assignRole,
  createRole,
  deleteRole,
  removeRole,
  reorderRoles,
  updateRole,
  type RolePermissions,
  type RoleRow,
} from "@/shared/api/roles";
import type { UserDirectoryEntry } from "@/shared/api/users";
import { formatApiError } from "@/shared/api/format-error";
import { displayNameOf } from "@/shared/lib/display-name";
import { CheckList, CheckListItem } from "@/shared/ui/check-list";
import {
  Alert,
  BadgeIcon,
  Button,
  ColorInput,
  ConfirmDialog,
  Disclosure,
  DragHandle,
  FieldGroup,
  Icon,
  RoleBadge,
  SettingRow,
  Swatches,
  Switch,
  TextField,
  TileGrid,
} from "@/shared/ui";
import { useAvatarStore } from "@/stores/avatar-store";
import { useMemberProfileStore } from "@/stores/member-profile-store";
import { applyRoleOrder, useRoleStore } from "@/stores/role-store";
import { restrictToVerticalAxis } from "@/widgets/aside-channels/sortable-utils";
import { PanelIntro } from "./panel-layout";

const ROLE_NAME_MAX = 32;

/** Быстрый выбор цвета; любой другой — через системную палитру. */
const NO_COLOR = "none";
const SWATCHES = [
  { value: NO_COLOR, label: "Без цвета", none: true },
  ...["#f23f43", "#f0b232", "#23a55a", "#1abc9c", "#3498db", "#5865f2", "#9b59b6", "#e91e63", "#e67e22", "#95a5a6"].map(
    (value) => ({ value, label: `Цвет ${value}` }),
  ),
];

const PERMISSION_ROWS: { key: keyof RolePermissions; title: string; detail: string }[] = [
  {
    key: "send_messages",
    title: "Отправлять сообщения",
    detail: "Позволяет писать и редактировать свои сообщения в текстовых каналах.",
  },
  {
    key: "speak",
    title: "Говорить",
    detail: "Позволяет включать микрофон в голосовых каналах. Без права участник только слушает.",
  },
  {
    key: "screen_share",
    title: "Проводить трансляцию",
    detail: "Позволяет демонстрировать экран в голосовых каналах.",
  },
  {
    key: "attach_files",
    title: "Отправлять картинки",
    detail: "Позволяет прикреплять изображения к сообщениям. Действует вместе с правом писать.",
  },
];

const ALL_ALLOWED: RolePermissions = { send_messages: true, speak: true, screen_share: true, attach_files: true };

const SYSTEM_HINT: Record<string, string> = {
  OWNER: "Владелец сервера. Выдаётся при установке.",
  ADMIN: "Администратор. Выдаётся в меню участника.",
  MEMBER: "Базовая роль: есть у каждого участника.",
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? formatApiError(error.message, fallback) : fallback;
}

export function RolesPanel({ members, defaultOpenId = null }: { members: UserDirectoryEntry[]; defaultOpenId?: number | null }) {
  const roles = useRoleStore((s) => s.roles);
  const [openId, setOpenId] = useState<number | null>(defaultOpenId);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Порядок приоритета: двигаются все роли, кроме базовой (она всегда снизу). */
  const orderedIds = roles.filter((role) => role.key !== "MEMBER").map((role) => role.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const run = useCallback(async (action: () => Promise<void>, fallback: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(false);
    }
  }, []);
  const toggleOpen = useCallback((id: number) => setOpenId((current) => (current === id ? null : id)), []);

  function onCreate() {
    const name = newName.trim();
    if (!name) {
      return;
    }
    void run(async () => {
      const role = await createRole({ name, color: null });
      setNewName("");
      setOpenId(role.id);
      useRoleStore.getState().upsertRole(role);
    }, "Не удалось создать роль");
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = orderedIds.indexOf(Number(active.id));
    const newIndex = orderedIds.indexOf(Number(over.id));
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const order = arrayMove(orderedIds, oldIndex, newIndex);
    const store = useRoleStore.getState();
    store.setRoles(applyRoleOrder(store.roles, order));
    void run(async () => {
      try {
        useRoleStore.getState().setRoles(await reorderRoles(order));
      } catch (e: unknown) {
        await useRoleStore.getState().load();
        throw e;
      }
    }, "Не удалось изменить порядок");
  }

  return (
    <div className="flex flex-col gap-4">
      <PanelIntro>
        Чем выше роль в списке, тем выше её приоритет. Чтобы изменить порядок, перетащите свёрнутую роль за ручку
        слева.
      </PanelIntro>
      <form
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <TextField
          aria-label="Название новой роли"
          className="flex-1"
          value={newName}
          onChange={setNewName}
          maxLength={ROLE_NAME_MAX}
          placeholder="Название новой роли"
        />
        <Button type="submit" leadingIcon="plus" isPending={busy} isDisabled={!newName.trim()}>
          Создать
        </Button>
      </form>
      {error ? (
        <Alert tone="danger" compact>
          {error}
        </Alert>
      ) : null}
      <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1.5">
            {roles.map((role) => (
              <RoleItem
                key={role.id}
                role={role}
                open={openId === role.id}
                busy={busy}
                members={members}
                onToggle={toggleOpen}
                run={run}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

type RoleItemProps = {
  role: RoleRow;
  open: boolean;
  busy: boolean;
  members: UserDirectoryEntry[];
  onToggle: (roleId: number) => void;
  run: (action: () => Promise<void>, fallback: string) => Promise<void>;
};

/** Сортируемая оболочка. На каждое движение при перетаскивании перерисовывается только она, карточка — в memo. */
function RoleItem(props: RoleItemProps) {
  const { role, open, busy } = props;
  // Развёрнутую роль не двигаем: тащить можно только свёрнутую строку.
  const dragDisabled = role.key === "MEMBER" || open || busy;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: role.id,
    disabled: dragDisabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null),
        transition: isDragging ? undefined : transition,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <RoleCard
        {...props}
        dragDisabled={dragDisabled}
        handleRef={setActivatorNodeRef}
        dragAttributes={attributes as HTMLAttributes<HTMLElement>}
        dragListeners={listeners as HTMLAttributes<HTMLElement> | undefined}
      />
    </li>
  );
}

const RoleCard = memo(function RoleCard({
  role,
  open,
  busy,
  members,
  onToggle,
  run,
  dragDisabled,
  handleRef,
  dragAttributes,
  dragListeners,
}: RoleItemProps & {
  dragDisabled: boolean;
  handleRef: (element: HTMLElement | null) => void;
  dragAttributes: HTMLAttributes<HTMLElement>;
  dragListeners?: HTMLAttributes<HTMLElement>;
}) {
  const movable = role.key !== "MEMBER";
  /** Черновик имени; null — показываем актуальное имя из каталога. */
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? role.name;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const colorTimer = useRef<number | null>(null);
  const holders = members.filter((member) => member.role_ids?.includes(role.id)).length;

  useEffect(
    () => () => {
      if (colorTimer.current !== null) {
        window.clearTimeout(colorTimer.current);
      }
    },
    [],
  );

  function saveName() {
    const next = name.trim();
    setDraft(null);
    if (!next || next === role.name) {
      return;
    }
    void run(async () => {
      useRoleStore.getState().upsertRole(await updateRole(role.id, { name: next }));
    }, "Не удалось переименовать роль");
  }

  function saveColor(color: string | null, debounce: boolean) {
    if (colorTimer.current !== null) {
      window.clearTimeout(colorTimer.current);
      colorTimer.current = null;
    }
    const commit = () => {
      void run(async () => {
        useRoleStore.getState().upsertRole(await updateRole(role.id, { color }));
      }, "Не удалось изменить цвет");
    };
    if (debounce) {
      // Системная палитра шлёт change на каждое движение — отправляем, когда пользователь остановился.
      colorTimer.current = window.setTimeout(commit, 500);
    } else {
      commit();
    }
  }

  return (
    <>
      <Disclosure
        isExpanded={open}
        onExpandedChange={() => onToggle(role.id)}
        handle={
          movable ? (
            <DragHandle
              ref={handleRef}
              label={`Перетащить роль «${role.name}»`}
              isDisabled={dragDisabled}
              {...dragAttributes}
              {...dragListeners}
            />
          ) : (
            <span className="w-7 shrink-0" aria-hidden />
          )
        }
        leading={<RoleBadge color={role.color ?? "transparent"} />}
        title={role.name}
        summary={role.key === "MEMBER" ? "все" : holders}
      >
        {/* Свёрнутое содержимое react-aria держит в DOM: без условия перетаскивание перерисовывало бы формы всех ролей. */}
        {open ? (
          <div className="flex flex-col gap-6 px-1 py-1">
            <TextField
              label="Название"
              hint={role.key ? SYSTEM_HINT[role.key] : undefined}
              value={name}
              maxLength={ROLE_NAME_MAX}
              isDisabled={busy}
              onChange={setDraft}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setDraft(null);
                }
              }}
            />
            <FieldGroup title="Цвет" description="Цвет имени в чате и в списке участников.">
              <div className="flex flex-wrap items-center gap-2">
                <Swatches
                  swatches={SWATCHES}
                  value={role.color ?? NO_COLOR}
                  isDisabled={busy}
                  onChange={(value) => saveColor(value === NO_COLOR ? null : value, false)}
                />
                <ColorInput
                  aria-label="Свой цвет"
                  isDisabled={busy}
                  value={role.color ?? "#99aab5"}
                  onChange={(value) => saveColor(value, true)}
                />
              </div>
            </FieldGroup>
            {movable ? (
              <SettingRow
                bordered={false}
                title="Показывать участников с ролью отдельно от остальных в сети"
                description="Если у участника несколько таких ролей, он попадёт в группу той, что выше в списке."
              >
                <Switch
                  aria-label="Показывать участников с ролью отдельно от остальных в сети"
                  isSelected={role.hoist ?? false}
                  isDisabled={busy}
                  onChange={(hoist) => {
                    void run(async () => {
                      useRoleStore.getState().upsertRole(await updateRole(role.id, { hoist }));
                    }, "Не удалось изменить настройку");
                  }}
                />
              </SettingRow>
            ) : null}
            <RoleBadgePicker role={role} busy={busy} run={run} />
            <RolePermissionsForm role={role} busy={busy} run={run} />
            {role.key === null ? <RoleHolders roleId={role.id} members={members} busy={busy} run={run} /> : null}
            {role.key === null ? (
              <div className="-mx-1 flex items-center justify-end border-t border-line px-1 pt-3">
                <Button
                  variant="danger-ghost"
                  size="sm"
                  leadingIcon="trash"
                  isDisabled={busy}
                  onPress={() => setConfirmDelete(true)}
                >
                  Удалить роль
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Disclosure>
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        tone="danger"
        title={`Удалить роль «${role.name}»?`}
        description="Роль будет снята со всех участников, а ограничения каналов по ней перестанут действовать."
        confirmLabel="Удалить"
        isPending={busy}
        onConfirm={() => {
          void run(async () => {
            await deleteRole(role.id);
            useRoleStore.getState().removeRole(role.id);
          }, "Не удалось удалить роль").finally(() => setConfirmDelete(false));
        }}
      />
    </>
  );
});

/** Права роли. Выключенный переключатель — запрет, и он побеждает разрешения других ролей. */
/** Плитка «без значка» в сетке. id каталога не может начинаться с «_». */
const NO_BADGE = "_none";

/** Значок роли: выбирается из значков каталога категории «Роль». Появляется у всех, у кого есть роль. */
function RoleBadgePicker({
  role,
  busy,
  run,
}: {
  role: RoleRow;
  busy: boolean;
  run: (action: () => Promise<void>, fallback: string) => Promise<void>;
}) {
  const badges = useAvatarStore((s) => s.catalog?.badges);
  useEffect(() => {
    void useAvatarStore.getState().loadCatalog();
  }, []);
  const roleBadges = (badges ?? []).filter((badge) => badge.category === "role");
  if (roleBadges.length === 0) {
    return null;
  }
  const tiles = [{ id: NO_BADGE, name: "Без значка", icon: null }, ...roleBadges];
  return (
    <FieldGroup title="Значок роли" description="Появится у ника каждого, у кого есть эта роль.">
      <TileGrid
        label="Значок роли"
        className="grid-cols-[repeat(auto-fill,44px)] gap-2 sm:grid-cols-[repeat(auto-fill,44px)]"
        columns={{ base: tiles.length, wide: tiles.length }}
        items={tiles}
        selectedId={role.badge_id ?? NO_BADGE}
        isDisabled={busy}
        onSelect={(id) => {
          const badgeId = id === NO_BADGE ? null : id;
          if (badgeId === (role.badge_id ?? null)) {
            return;
          }
          void run(async () => {
            useRoleStore.getState().upsertRole(await updateRole(role.id, { badge_id: badgeId }));
          }, "Не удалось изменить значок");
        }}
        getLabel={(item) => item.name}
        getTooltip={(item) => item.name}
        renderTile={(item) =>
          item.icon ? (
            <span className="absolute inset-0 grid place-items-center">
              <BadgeIcon icon={item.icon} size={24} />
            </span>
          ) : (
            <span className="absolute inset-0 grid place-items-center text-muted">
              <Icon name="close" size="xs" />
            </span>
          )
        }
      />
    </FieldGroup>
  );
}

function RolePermissionsForm({
  role,
  busy,
  run,
}: {
  role: RoleRow;
  busy: boolean;
  run: (action: () => Promise<void>, fallback: string) => Promise<void>;
}) {
  if (role.key === "OWNER" || role.key === "ADMIN") {
    return (
      <FieldGroup
        title="Права роли"
        description="Всё разрешено: владелец и администраторы не подчиняются запретам ролей."
      />
    );
  }
  // Старый сервер может не прислать новое поле — считаем его разрешённым.
  const current = { ...ALL_ALLOWED, ...role.permissions };
  const allAllowed = PERMISSION_ROWS.every((row) => current[row.key]);

  function save(patch: Partial<RolePermissions>) {
    void run(async () => {
      useRoleStore.getState().upsertRole(await updateRole(role.id, { permissions: patch }));
    }, "Не удалось изменить права");
  }

  return (
    <FieldGroup
      title="Права роли"
      description="Выключенное право — запрет. Он действует, даже если другие роли участника это разрешают."
      aside={
        allAllowed ? null : (
          <Button variant="ghost" size="sm" leadingIcon="refresh" isDisabled={busy} onPress={() => save(ALL_ALLOWED)}>
            Сбросить
          </Button>
        )
      }
    >
      <ul className="divide-y divide-line border border-line">
        {PERMISSION_ROWS.map((row) => (
          <li key={row.key} className="px-3 py-2.5">
            <SettingRow bordered={false} title={row.title} description={row.detail}>
              <Switch
                aria-label={row.title}
                isSelected={current[row.key]}
                isDisabled={busy}
                onChange={(allowed) => save({ [row.key]: allowed })}
              />
            </SettingRow>
          </li>
        ))}
      </ul>
    </FieldGroup>
  );
}

function RoleHolders({
  roleId,
  members,
  busy,
  run,
}: {
  roleId: number;
  members: UserDirectoryEntry[];
  busy: boolean;
  run: (action: () => Promise<void>, fallback: string) => Promise<void>;
}) {
  function toggle(userId: number, on: boolean) {
    void run(async () => {
      const updated = on ? await assignRole(roleId, userId) : await removeRole(roleId, userId);
      useMemberProfileStore.getState().setRoles(updated.user_id, updated.roles, updated.role_ids);
    }, "Не удалось изменить роль участника");
  }

  return (
    <FieldGroup title="Участники с ролью" description={`Отмечено: ${members.filter((m) => m.role_ids?.includes(roleId)).length}`}>
      <CheckList className="max-h-48">
        {members.map((member) => (
          <CheckListItem
            key={member.id}
            checked={member.role_ids?.includes(roleId) ?? false}
            disabled={busy}
            onChange={(on) => toggle(member.id, on)}
          >
            {displayNameOf(member)}
          </CheckListItem>
        ))}
      </CheckList>
    </FieldGroup>
  );
}

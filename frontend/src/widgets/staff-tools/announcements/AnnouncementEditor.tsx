import { useRef, useState, type KeyboardEvent } from "react";
import { formatKindFromShortcut, toggleFormat, type FormatKind } from "@/features/chat/message-content";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  deleteAnnouncement,
  saveAnnouncement,
  type AnnouncementInput,
  type AnnouncementRow,
} from "@/shared/api/announcements";
import { formatApiError } from "@/shared/api/format-error";
import type { UserDirectoryEntry } from "@/shared/api/users";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DropdownMenu,
  FieldGroup,
  IconButton,
  MenuItem,
  SectionLabel,
  SegmentedControl,
  Tag,
  Textarea,
  TextField,
  Toolbar,
  Tooltip,
  type IconName,
} from "@/shared/ui";
import { NotesText } from "@/shared/ui/notes-text";
import { useRoleStore } from "@/stores/role-store";
import { LocalHourField } from "../challenges/fields";
import { EditorFooter, EditorHeader } from "../panel-layout";

const FORMATS: { kind: FormatKind; label: string; shortcut: string; icon: IconName }[] = [
  { kind: "bold", label: "Полужирный", shortcut: "Ctrl+B", icon: "bold" },
  { kind: "italic", label: "Наклонный", shortcut: "Ctrl+I", icon: "italic" },
  { kind: "strike", label: "Зачёркнутый", shortcut: "Ctrl+Shift+S", icon: "strike" },
  { kind: "underline", label: "Подчёркнутый", shortcut: "Ctrl+U", icon: "underline" },
  { kind: "code", label: "Моноширинный", shortcut: "Ctrl+Shift+M", icon: "code" },
];

function memberName(member: Pick<UserDirectoryEntry, "username" | "display_name">): string {
  return member.display_name ?? member.username;
}

/** Редактор объявления (только владелец). Показанное — только просмотр и удаление: получатели уже зафиксированы. */
export function AnnouncementEditor({
  announcement,
  members,
  timezone,
  onSaved,
  onBack,
}: {
  announcement: AnnouncementRow | null;
  members: UserDirectoryEntry[];
  timezone: string | null;
  onSaved: (row: AnnouncementRow | null) => void;
  onBack: () => void;
}) {
  const roles = useRoleStore((s) => s.roles);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [showAt, setShowAt] = useState<string | null>(announcement?.show_at ?? null);
  const [expiresAt, setExpiresAt] = useState<string | null>(announcement?.expires_at ?? null);
  const [roleIds, setRoleIds] = useState<number[]>(announcement?.role_ids ?? []);
  const [userIds, setUserIds] = useState<number[]>(announcement?.user_ids ?? []);
  const [everyone, setEveryone] = useState(!announcement || (announcement.role_ids.length === 0 && announcement.user_ids.length === 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const delivered = Boolean(announcement?.delivered_at);
  const locked = busy || delivered;

  function applyFormat(kind: FormatKind) {
    const element = bodyRef.current;
    if (!element) return;
    const next = toggleFormat(body, element.selectionStart, element.selectionEnd, kind);
    setBody(next.text);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(next.start, next.end);
    });
  }

  function onBodyKeyDown(event: KeyboardEvent) {
    const kind = formatKindFromShortcut(event);
    if (kind) {
      event.preventDefault();
      applyFormat(kind);
    }
  }

  async function save() {
    const input: AnnouncementInput = {
      title: title.trim(),
      body: body.trim(),
      show_at: showAt ?? "",
      expires_at: expiresAt,
      role_ids: everyone ? [] : roleIds,
      user_ids: everyone ? [] : userIds,
    };
    if (!input.title || !input.body) {
      setError("Нужны заголовок и текст");
      return;
    }
    if (!showAt) {
      setError("Укажите, когда показать");
      return;
    }
    if (expiresAt && expiresAt <= showAt) {
      setError("«Показывать до» должно быть позже даты показа");
      return;
    }
    if (!everyone && roleIds.length === 0 && userIds.length === 0) {
      setError("Выберите роли или участников");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveAnnouncement(announcement?.id ?? null, input));
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message, "Не удалось сохранить") : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!announcement) return;
    setBusy(true);
    try {
      await deleteAnnouncement(announcement.id);
      onSaved(null);
      onBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message, "Не удалось удалить") : "Не удалось удалить");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const pickableRoles = roles.filter((role) => !roleIds.includes(role.id));
  const pickableMembers = members
    .filter((member) => !userIds.includes(member.id))
    .sort((a, b) => memberName(a).localeCompare(memberName(b), "ru"));

  return (
    <div className="flex flex-col gap-5">
      <EditorHeader
        title={announcement ? announcement.title : "Новое объявление"}
        backLabel="К списку объявлений"
        onBack={onBack}
        status={
          announcement ? (
            <Badge variant={delivered ? "neutral" : "brand"}>{delivered ? "Показано" : "Запланировано"}</Badge>
          ) : null
        }
      />

      {announcement && delivered ? (
        <Alert tone="info" compact>
          Объявление уже показано: прочитали {announcement.seen_count} из {announcement.recipients_count}. Изменить нельзя — только удалить
          (тогда его не увидят те, кто ещё не прочитал).
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <TextField label="Заголовок" value={title} maxLength={ANNOUNCEMENT_TITLE_MAX} isDisabled={locked} onChange={setTitle} placeholder="Турнир в субботу" />

          <FieldGroup
            title="Текст"
            aside={
            <Toolbar aria-label="Форматирование">
              {FORMATS.map((item) => (
                <Tooltip key={item.kind} content={`${item.label} (${item.shortcut})`}>
                  <IconButton
                    icon={item.icon}
                    label={item.label}
                    size="sm"
                    isDisabled={locked}
                    preventFocusOnPress
                    onPress={() => applyFormat(item.kind)}
                  />
                </Tooltip>
              ))}
            </Toolbar>
            }
          >
            <Textarea
              ref={bodyRef}
              aria-label="Текст объявления"
              value={body}
              rows={8}
              maxLength={ANNOUNCEMENT_BODY_MAX}
              showCount
              isDisabled={locked}
              onChange={setBody}
              onKeyDown={onBodyKeyDown}
              hint="Строка с «# » — заголовок, с «- » — пункт списка, пустая строка — отступ. Выделите текст и нажмите кнопку форматирования."
            />
          </FieldGroup>

          <FieldGroup
            title="Когда показать"
            description={`По часам сервера${timezone ? ` (${timezone})` : ""}. Каждый получатель увидит окно один раз: сразу, если он в сети, иначе — при следующем входе.`}
          >
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <LocalHourField label="Показать" value={showAt} isRequired anyMinute isDisabled={locked} onChange={setShowAt} />
              <LocalHourField label="Показывать до" value={expiresAt} anyMinute isDisabled={locked} onChange={setExpiresAt} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              «Показывать до» необязательно: после этой даты окно не покажут тем, кто не успел зайти.
            </p>
          </FieldGroup>

          <FieldGroup
            title="Кому"
            description="Получатели — участники на момент показа."
            aside={
              <SegmentedControl
                aria-label="Кому показать"
                value={everyone ? "all" : "pick"}
                isDisabled={locked}
                onChange={(value) => setEveryone(value === "all")}
                options={[
                  { value: "all", label: "Всем" },
                  { value: "pick", label: "Выбрать" },
                ]}
              />
            }
          >
            {everyone ? null : (
              <div className="flex flex-wrap items-center gap-2">
                {roleIds.map((id) => (
                  <Tag key={`role:${id}`} removeLabel="Убрать роль" onRemove={locked ? undefined : () => setRoleIds(roleIds.filter((r) => r !== id))}>
                    Роль «{roles.find((role) => role.id === id)?.name ?? id}»
                  </Tag>
                ))}
                {userIds.map((id) => {
                  const member = members.find((m) => m.id === id);
                  return (
                    <Tag key={`user:${id}`} removeLabel="Убрать участника" onRemove={locked ? undefined : () => setUserIds(userIds.filter((u) => u !== id))}>
                      {member ? memberName(member) : `#${id}`}
                    </Tag>
                  );
                })}
                <DropdownMenu
                  aria-label="Добавить роль"
                  trigger={
                    <Button variant="secondary" size="sm" leadingIcon="plus" isDisabled={locked || pickableRoles.length === 0}>
                      Роль
                    </Button>
                  }
                  onAction={(key) => setRoleIds([...roleIds, Number(key)])}
                >
                  {pickableRoles.map((role) => (
                    <MenuItem key={role.id} id={role.id}>
                      {role.name}
                    </MenuItem>
                  ))}
                </DropdownMenu>
                <DropdownMenu
                  aria-label="Добавить участника"
                  trigger={
                    <Button variant="secondary" size="sm" leadingIcon="plus" isDisabled={locked || pickableMembers.length === 0}>
                      Участник
                    </Button>
                  }
                  onAction={(key) => setUserIds([...userIds, Number(key)])}
                >
                  {pickableMembers.map((member) => (
                    <MenuItem key={member.id} id={member.id}>
                      {memberName(member)}
                    </MenuItem>
                  ))}
                </DropdownMenu>
              </div>
            )}
          </FieldGroup>
        </div>

        <div className="flex flex-col gap-2 lg:sticky lg:top-0">
          <SectionLabel>Так увидит участник</SectionLabel>
          <Card variant="outline" className="flex flex-col gap-3 p-4">
            <p className="break-words font-heading text-lg tracking-tight">{title.trim() || "Без заголовка"}</p>
            {body.trim() ? <NotesText body={body} /> : <p className="text-sm text-muted">Текст появится здесь.</p>}
          </Card>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" compact>
          {error}
        </Alert>
      ) : null}

      <EditorFooter>
        {announcement ? (
          <Button variant="danger-ghost" leadingIcon="trash" className="mr-auto" isDisabled={busy} onPress={() => setConfirmDelete(true)}>
            Удалить
          </Button>
        ) : null}
        {delivered ? null : (
          <Button isPending={busy} onPress={() => void save()}>
            {announcement ? "Сохранить" : "Запланировать"}
          </Button>
        )}
      </EditorFooter>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        tone="danger"
        title="Удалить объявление?"
        description={delivered ? "Те, кто ещё не прочитал, его не увидят." : "Оно не будет показано."}
        confirmLabel="Удалить"
        isPending={busy}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

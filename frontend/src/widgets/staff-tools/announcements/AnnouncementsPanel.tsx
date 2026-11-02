import { useEffect, useState } from "react";
import { formatLocalHour } from "@/features/challenges/condition-text";
import { fetchAnnouncements, type AnnouncementRow } from "@/shared/api/announcements";
import { formatApiError } from "@/shared/api/format-error";
import { fetchServerSettings } from "@/shared/api/server-settings";
import type { UserDirectoryEntry } from "@/shared/api/users";
import { Alert, Badge, Button, EmptyState, FieldGroup, ListItem, Spinner } from "@/shared/ui";
import { useRoleStore } from "@/stores/role-store";
import { PanelIntro } from "../panel-layout";
import { AnnouncementEditor } from "./AnnouncementEditor";

/** Раздел «Объявления» панели управления (только владелец): запланированные и показанные, редактор. */
export function AnnouncementsPanel({ members }: { members: UserDirectoryEntry[] }) {
  const roles = useRoleStore((s) => s.roles);
  const [rows, setRows] = useState<AnnouncementRow[] | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** null — список; "new" — новое объявление; число — открытое. */
  const [editing, setEditing] = useState<number | "new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAnnouncements()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? formatApiError(e.message) : "Не удалось загрузить объявления");
      });
    fetchServerSettings()
      .then((settings) => {
        if (!cancelled) setTimezone(settings.timezone ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows) {
    return error ? (
      <Alert tone="danger" compact>
        {error}
      </Alert>
    ) : (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (editing !== null) {
    const current = editing === "new" ? null : (rows.find((row) => row.id === editing) ?? null);
    return (
      <AnnouncementEditor
        key={editing}
        announcement={current}
        members={members}
        timezone={timezone}
        onBack={() => setEditing(null)}
        onSaved={(row) => {
          if (!row) {
            setRows(rows.filter((r) => r.id !== editing));
            return;
          }
          setRows(rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [row, ...rows]);
          setEditing(null);
        }}
      />
    );
  }

  function audience(row: AnnouncementRow): string {
    if (row.role_ids.length === 0 && row.user_ids.length === 0) {
      return "всем";
    }
    const names = [
      ...row.role_ids.map((id) => `«${roles.find((role) => role.id === id)?.name ?? id}»`),
      ...row.user_ids.map((id) => {
        const member = members.find((m) => m.id === id);
        return member ? (member.display_name ?? member.username) : `#${id}`;
      }),
    ];
    return names.join(", ");
  }

  const scheduled = rows.filter((row) => !row.delivered_at).sort((a, b) => a.show_at.localeCompare(b.show_at));
  const shown = rows.filter((row) => row.delivered_at);

  return (
    <div className="flex flex-col gap-5">
      <PanelIntro
        action={
          <Button size="sm" leadingIcon="plus" onPress={() => setEditing("new")}>
            Новое объявление
          </Button>
        }
      >
        Окно с заголовком и текстом, которое получатели увидят один раз в назначенное время по часам сервера
        {timezone ? ` (${timezone})` : ""}.
      </PanelIntro>
      {rows.length === 0 ? (
        <EmptyState title="Объявлений пока нет" description="Запланируйте первое: например, анонс турнира на субботу." />
      ) : (
        <>
          {scheduled.length > 0 ? (
            <FieldGroup title={`Запланированные · ${scheduled.length}`}>
            <div className="flex flex-col gap-0.5 border border-line p-1">
              {scheduled.map((row) => (
                <ListItem
                  key={row.id}
                  size="lg"
                  onPress={() => setEditing(row.id)}
                  description={`${formatLocalHour(row.show_at)} · ${audience(row)}`}
                  trailing={<Badge variant="brand">Запланировано</Badge>}
                >
                  {row.title}
                </ListItem>
              ))}
            </div>
            </FieldGroup>
          ) : null}
          {shown.length > 0 ? (
            <FieldGroup title={`Показанные · ${shown.length}`}>
            <div className="flex flex-col gap-0.5 border border-line p-1">
              {shown.map((row) => (
                <ListItem
                  key={row.id}
                  size="lg"
                  onPress={() => setEditing(row.id)}
                  description={`${formatLocalHour(row.show_at)} · прочитали ${row.seen_count} из ${row.recipients_count}`}
                  trailing={<Badge variant="neutral">Показано</Badge>}
                >
                  {row.title}
                </ListItem>
              ))}
            </div>
            </FieldGroup>
          ) : null}
        </>
      )}
    </div>
  );
}

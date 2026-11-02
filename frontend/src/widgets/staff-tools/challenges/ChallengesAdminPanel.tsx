import { useEffect, useMemo, useState } from "react";
import { fetchChallenges, type Challenge } from "@/shared/api/challenges";
import { formatApiError } from "@/shared/api/format-error";
import { fetchServerSettings, patchServerSettings } from "@/shared/api/server-settings";
import { Alert, Badge, Button, EmptyState, ListItem, Select, SettingRow, Spinner } from "@/shared/ui";
import { useAvatarStore } from "@/stores/avatar-store";
import { PanelIntro } from "../panel-layout";
import { ChallengeEditor } from "./ChallengeEditor";
import { CHALLENGE_STATUS } from "./challenge-status";

/** Часовые пояса рантайма; старый браузер без `supportedValuesOf` — только текущий и Москва. */
function timeZones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set([current, "UTC", "Europe/Moscow", ...all])];
}

/** Пояс сообщества: по нему считаются дни, серии и окна испытаний. */
function TimezoneSetting() {
  const [timezone, setTimezone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchServerSettings()
      .then((settings) => {
        if (!cancelled) setTimezone(settings.timezone ?? "UTC");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const options = useMemo(() => (timezone ? timeZones(timezone).map((zone) => ({ value: zone, label: zone })) : []), [timezone]);
  if (!timezone) return null;
  return (
    <SettingRow
      title="Часовой пояс сервера"
      description={error ?? "По нему считаются календарные дни, серии и даты испытаний. Смена пояса пересчитывает прогресс, данные не теряются."}
    >
      <Select
        aria-label="Часовой пояс сервера"
        className="w-60"
        value={timezone}
        options={options}
        onChange={(zone) => {
          setError(null);
          patchServerSettings({ timezone: zone })
            .then((settings) => setTimezone(settings.timezone ?? zone))
            .catch((e: unknown) => setError(e instanceof Error ? formatApiError(e.message) : "Не удалось сохранить"));
        }}
      />
    </SettingRow>
  );
}

/** Раздел «Испытания» панели управления (только владелец): список, редактор, пояс сервера. */
export function ChallengesAdminPanel() {
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** null — список; "new" — новое испытание; число — редактируемое. */
  const [editing, setEditing] = useState<number | "new" | null>(null);

  useEffect(() => {
    void useAvatarStore.getState().loadCatalog();
    let cancelled = false;
    fetchChallenges()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? formatApiError(e.message) : "Не удалось загрузить испытания");
      });
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
      <ChallengeEditor
        key={editing}
        challenge={current}
        challenges={rows}
        onBack={() => setEditing(null)}
        onSaved={(row) => {
          if (!row) {
            setRows(rows.filter((r) => r.id !== editing));
            return;
          }
          setRows(rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [row, ...rows]);
          setEditing(row.id);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PanelIntro
        action={
          <Button size="sm" leadingIcon="plus" onPress={() => setEditing("new")}>
            Новое испытание
          </Button>
        }
      >
        Испытание — условия и награда. Выполнил — получил косметику навсегда, автоматически.
      </PanelIntro>
      <TimezoneSetting />
      {rows.length === 0 ? (
        <EmptyState title="Испытаний пока нет" description="Придумайте первое: например, «5 часов в голосе — рамка»." />
      ) : (
        <div className="flex flex-col gap-0.5 border border-line p-1">
          {rows.map((row) => (
            <ListItem
              key={row.id}
              size="lg"
              onPress={() => setEditing(row.id)}
              description={`Выполнили: ${row.completions}`}
              trailing={<Badge variant={CHALLENGE_STATUS[row.status].variant}>{CHALLENGE_STATUS[row.status].label}</Badge>}
            >
              {row.title}
            </ListItem>
          ))}
        </div>
      )}
    </div>
  );
}

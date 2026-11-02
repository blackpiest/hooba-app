import { useEffect, useState } from "react";
import { formatApiError } from "@/shared/api/format-error";
import { fetchReports, resolveReport, type ReportRow, type ReportStatus } from "@/shared/api/reports";
import { messageStamp } from "@/shared/lib/date-format";
import { displayNameOf } from "@/shared/lib/display-name";
import { Alert, Button, Card, ConfirmDialog, EmptyState, SegmentedControl, Spinner, toast } from "@/shared/ui";
import { UserAvatar } from "@/shared/ui/user-avatar/UserAvatar";
import { useReportStore } from "@/stores/report-store";
import { PROFILE_TRIGGER_ATTR, toggleProfileCard } from "@/widgets/user-profile-card";

const PAGE_SIZE = 20;

function stamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : messageStamp(date);
}

/**
 * Жалобы участников. «Новые» — открытые, «Рассмотренные» — закрытые админом.
 * Карточка: «Жалоба на <цель>» (мини-профиль по клику), причина, кто пожаловался и когда;
 * внизу — «Снять админа» (только владелец, если цель админ) и «Заблокировать», оба с подтверждением.
 */
export function ReportsPanel({
  viewerId,
  viewerIsOwner,
  onRevokeAdmin,
  onBanMember,
}: {
  viewerId: number | null;
  viewerIsOwner: boolean;
  onRevokeAdmin: (userId: number) => Promise<boolean>;
  onBanMember: (userId: number) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<ReportStatus>("open");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  // Любое изменение жалоб на сервере (новая, рассмотренная) приходит по WS и бампает revision.
  const revision = useReportStore((s) => s.revision);

  useEffect(() => {
    let cancelled = false;
    fetchReports(status, 0, PAGE_SIZE)
      .then((page) => {
        if (cancelled) {
          return;
        }
        setError(null);
        setRows(page);
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? formatApiError(e.message) : "Не удалось загрузить жалобы");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, revision]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await fetchReports(status, rows.length, PAGE_SIZE);
      setRows((prev) => {
        const known = new Set(prev.map((row) => row.id));
        return [...prev, ...page.filter((row) => !known.has(row.id))];
      });
      setHasMore(page.length === PAGE_SIZE);
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message) : "Не удалось загрузить жалобы");
    } finally {
      setLoadingMore(false);
    }
  }

  async function onResolve(row: ReportRow) {
    setResolvingId(row.id);
    setError(null);
    try {
      await resolveReport(row.id);
      toast.success("Жалоба рассмотрена");
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message) : "Не удалось отметить жалобу");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        aria-label="Статус жалоб"
        className="self-start"
        value={status}
        onChange={(value) => {
          setLoading(true);
          setStatus(value as ReportStatus);
        }}
        options={[
          { value: "open", label: "Новые" },
          { value: "resolved", label: "Рассмотренные" },
        ]}
      />
      {error ? (
        <Alert tone="warning" compact>
          {error}
        </Alert>
      ) : null}
      {loading ? (
        <div className="flex min-h-32 items-center justify-center">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState compact title={status === "open" ? "Новых жалоб нет." : "Рассмотренных жалоб нет."} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const targetIsStaff = row.target.role_keys.includes("OWNER") || row.target.role_keys.includes("ADMIN");
            // Жалобу на OWNER/ADMIN рассматривает только владелец; на себя — никто.
            const canResolve = row.target.id !== viewerId && (viewerIsOwner || !targetIsStaff);
            return (
              <li key={row.id}>
                <ReportCard
                  row={row}
                  canResolve={canResolve}
                  resolving={resolvingId === row.id}
                  onResolve={() => void onResolve(row)}
                  onRevokeAdmin={
                    viewerIsOwner
                      ? async () => {
                          const ok = await onRevokeAdmin(row.target.id);
                          if (ok) {
                            // Роль снята у цели во всех её жалобах.
                            setRows((prev) =>
                              prev.map((item) =>
                                item.target.id === row.target.id
                                  ? { ...item, target: { ...item.target, role_keys: item.target.role_keys.filter((k) => k !== "ADMIN") } }
                                  : item,
                              ),
                            );
                          }
                          return ok;
                        }
                      : null
                  }
                  onBan={() => onBanMember(row.target.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && !loading ? (
        <Button variant="secondary" size="sm" className="self-center" isPending={loadingMore} onPress={() => void loadMore()}>
          Показать ещё
        </Button>
      ) : null}
    </div>
  );
}

function ReportCard({
  row,
  canResolve,
  resolving,
  onResolve,
  onRevokeAdmin,
  onBan,
}: {
  row: ReportRow;
  canResolve: boolean;
  resolving: boolean;
  onResolve: () => void;
  /** `null` — снять админа может только владелец. */
  onRevokeAdmin: (() => Promise<boolean>) | null;
  onBan: () => Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState<"admin" | "ban" | null>(null);
  const [acting, setActing] = useState(false);
  const targetName = displayNameOf(row.target);
  const reporterName = displayNameOf(row.reporter);
  const targetIsAdmin = row.target.role_keys.includes("ADMIN");

  async function runConfirmed() {
    const action = confirm === "admin" ? onRevokeAdmin : onBan;
    if (!action) {
      return;
    }
    setActing(true);
    try {
      if (await action()) {
        setConfirm(null);
      }
    } finally {
      setActing(false);
    }
  }

  return (
    <Card variant="outline" className="flex flex-col gap-3 p-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-3">
        <span className="text-xs text-muted">Жалоба на</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Профиль: ${targetName}`}
          {...{ [PROFILE_TRIGGER_ATTR]: "" }}
          className="-my-1 min-h-0 min-w-0 max-w-full justify-start gap-2 px-1.5 py-1"
          onPress={(event) => toggleProfileCard(row.target.id, targetName, event.target, "left")}
        >
          <UserAvatar userId={row.target.id} name={targetName} size="sm" />
          <span className="min-w-0 truncate text-sm font-medium text-fg">{targetName}</span>
        </Button>
        <time dateTime={row.created_at} className="ml-auto shrink-0 font-label text-[11px] tabular-nums text-muted">
          {stamp(row.created_at)}
        </time>
      </div>
      <p className="mx-3 whitespace-pre-wrap break-words border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-fg">
        {row.reason}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-bg px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted">
          <span className="shrink-0">От</span>
          <Button
            variant="ghost"
            size="sm"
            {...{ [PROFILE_TRIGGER_ATTR]: "" }}
            className="min-h-0 min-w-0 px-1 py-0.5 text-xs font-medium text-fg"
            onPress={(event) => toggleProfileCard(row.reporter.id, reporterName, event.target, "left")}
          >
            <span className="truncate">{reporterName}</span>
          </Button>
        </div>
        {row.resolved_at ? (
          <span className="text-xs text-muted">
            Рассмотрел {row.resolved_by ? displayNameOf(row.resolved_by) : "—"} · {stamp(row.resolved_at)}
          </span>
        ) : canResolve ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" isPending={resolving} onPress={onResolve}>
              Рассмотрена
            </Button>
            {onRevokeAdmin && targetIsAdmin ? (
              <Button size="sm" variant="secondary" onPress={() => setConfirm("admin")}>
                Снять админа
              </Button>
            ) : null}
            <Button size="sm" variant="danger" onPress={() => setConfirm("ban")}>
              Заблокировать
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted">Рассмотреть может только владелец.</span>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        tone={confirm === "ban" ? "danger" : undefined}
        title={confirm === "ban" ? "Заблокировать участника?" : "Снять админа?"}
        description={
          confirm === "ban"
            ? `Аккаунт ${targetName} будет закрыт: войти он больше не сможет.`
            : `${targetName} потеряет права администратора`
        }
        confirmLabel={confirm === "ban" ? "Заблокировать" : "Снять"}
        isPending={acting}
        onConfirm={() => void runConfirmed()}
      />
    </Card>
  );
}

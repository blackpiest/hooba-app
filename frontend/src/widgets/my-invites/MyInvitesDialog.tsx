import { useEffect, useState } from "react";
import { fetchMyInvites, type MyInviteRow } from "@/shared/api/invites";
import { formatApiError } from "@/shared/api/format-error";
import { displayNameOf } from "@/shared/lib/display-name";
import { buildInviteLink } from "@/shared/lib/server-target";
import { Alert, Badge, EmptyState, InviteCodeCard, Modal, Spinner } from "@/shared/ui";
import { UserAvatar } from "@/shared/ui/user-avatar/UserAvatar";

function formatDate(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function inviteNote(invite: MyInviteRow) {
  if (invite.status === "used" && invite.used_by) {
    const name = displayNameOf(invite.used_by);
    return (
      <span className="inline-flex items-center gap-1.5 text-fg">
        <UserAvatar userId={invite.used_by.id} name={name} size="sm" />
        {name}
        <span className="text-muted">· {formatDate(invite.used_at)}</span>
      </span>
    );
  }
  if (invite.status === "revoked") {
    return "Код отозван владельцем сервера.";
  }
  return "Одноразовый: сработает на одну регистрацию.";
}

/** Модалка личных приглашений участника: 3 одноразовых кода, новые взамен использованных не выдаются. */
export function MyInvitesDialog({ onClose }: { onClose: () => void }) {
  const [invites, setInvites] = useState<MyInviteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyInvites()
      .then((data) => {
        if (!cancelled) {
          setInvites(data.invites);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? formatApiError(e.message) : "Не удалось загрузить приглашения");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const left = invites?.filter((invite) => invite.status === "active").length ?? 0;

  return (
    <Modal isOpen size="md" title="Ваши инвайты" onClose={onClose}>
      {error ? (
        <Alert tone="danger" compact>
          {error}
        </Alert>
      ) : invites === null ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Вам доступны персональные инвайты для того, чтобы вы могли позвать своих друзей на этот сервер</p>
            <Badge variant={left > 0 ? "brand" : "neutral"} className="shrink-0 whitespace-nowrap">
              Осталось {left} из {invites.length}
            </Badge>
          </div>
          {invites.length === 0 ? (
            <EmptyState compact title="Доступных инвайтов нет" />
          ) : (
            <ul className="flex flex-col gap-2">
              {invites.map((invite) => (
                <li key={invite.id}>
                  <InviteCodeCard
                    code={invite.code}
                    link={buildInviteLink(invite.code)}
                    status={invite.status}
                    note={inviteNote(invite)}
                  />
                </li>
              ))}
            </ul>
          )}
          {invites.length > 0 && left === 0 ? (
            <EmptyState compact title="Поздравляем! Вы использовали все выделенные вам пригласительные" />
          ) : null}
        </div>
      )}
    </Modal>
  );
}

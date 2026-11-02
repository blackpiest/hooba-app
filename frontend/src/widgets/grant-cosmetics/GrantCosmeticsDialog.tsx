import { useEffect, useState } from "react";
import {
  fetchUserCosmetics,
  grantBadge,
  grantCosmetic,
  revokeCosmetic,
  grantTitle,
  revokeBadge,
  revokeTitle,
  type UserCosmetics,
} from "@/shared/api/badges";
import { formatApiError } from "@/shared/api/format-error";
import { Alert, BadgeIcon, Modal, SectionLabel, Spinner } from "@/shared/ui";
import { CheckList, CheckListItem } from "@/shared/ui/check-list";
import { useAvatarStore } from "@/stores/avatar-store";

/**
 * Выдача значков и титулов участнику (только владелец). Значки ролей здесь не выдаются: они приходят с ролью
 * и показаны отметкой «от роли». Изменение применяется сразу, как в окне «Роли».
 */
export function GrantCosmeticsDialog({
  userId,
  username,
  onClose,
}: {
  userId: number;
  username: string;
  onClose: () => void;
}) {
  const catalog = useAvatarStore((s) => s.catalog);
  const [cosmetics, setCosmetics] = useState<UserCosmetics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useAvatarStore.getState().loadCatalog();
    let cancelled = false;
    fetchUserCosmetics(userId)
      .then((data) => {
        if (!cancelled) setCosmetics(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? formatApiError(e.message) : "Не удалось загрузить");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function run(action: () => Promise<UserCosmetics>) {
    setBusy(true);
    setError(null);
    try {
      setCosmetics(await action());
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message) : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const ownedBadges = new Map((cosmetics?.badges ?? []).map((item) => [item.id, item]));
  const ownedTitles = new Set((cosmetics?.titles ?? []).map((item) => item.id));
  /** Рамки, фоны, персонажи, выданные лично (вручную, за испытание, LEGACY). */
  const ownedItems = new Map((cosmetics?.items ?? []).map((item) => [`${item.kind}:${item.id}`, item.source]));
  const lockables = catalog
    ? [
        ...catalog.frames.map((item) => ({ kind: "frame" as const, id: item.id, name: item.label, prefix: "Рамка" })),
        ...catalog.backgrounds.map((item) => ({ kind: "background" as const, id: item.id, name: item.label, prefix: "Фон" })),
        ...catalog.characters.map((item) => ({ kind: "character" as const, id: item.id, name: item.name, prefix: "Персонаж" })),
      ]
    : [];
  const SOURCE_NOTE: Record<string, string> = { challenge: "за испытание", legacy: "носил раньше", manual: "" };

  return (
    <Modal isOpen title="Значки и титулы" subtitle={username} size="sm" onClose={onClose}>
      {!cosmetics || !catalog ? (
        error ? null : (
          <div className="flex min-h-32 items-center justify-center">
            <Spinner />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <SectionLabel>Значки · выдача применяется сразу</SectionLabel>
            <CheckList className="mt-3 max-h-64">
              {catalog.badges.map((badge) => {
                const owned = ownedBadges.get(badge.id);
                const fromRole = badge.category === "role";
                return (
                  <CheckListItem
                    key={badge.id}
                    checked={owned !== undefined}
                    disabled={busy || fromRole}
                    onChange={(on) =>
                      void run(() => (on ? grantBadge(userId, badge.id) : revokeBadge(userId, badge.id)))
                    }
                    trailing={fromRole ? "от роли" : undefined}
                  >
                    <span className="flex items-center gap-2">
                      <BadgeIcon icon={badge.icon} size={18} />
                      {badge.name}
                    </span>
                  </CheckListItem>
                );
              })}
            </CheckList>
          </div>
          <div>
            <SectionLabel>Рамки, фоны, персонажи · нужно только для закрытых наградой испытания</SectionLabel>
            <CheckList className="mt-3 max-h-48">
              {lockables.map((item) => {
                const source = ownedItems.get(`${item.kind}:${item.id}`);
                return (
                  <CheckListItem
                    key={`${item.kind}:${item.id}`}
                    checked={source !== undefined}
                    disabled={busy}
                    onChange={(on) =>
                      void run(() => (on ? grantCosmetic(userId, item.kind, item.id) : revokeCosmetic(userId, item.kind, item.id)))
                    }
                    trailing={source ? SOURCE_NOTE[source] || undefined : undefined}
                  >
                    {item.prefix} «{item.name}»
                  </CheckListItem>
                );
              })}
            </CheckList>
          </div>
          {catalog.titles.length > 0 ? (
            <div>
              <SectionLabel>Титулы</SectionLabel>
              <CheckList className="mt-3 max-h-48">
                {catalog.titles.map((title) => (
                  <CheckListItem
                    key={title.id}
                    checked={ownedTitles.has(title.id)}
                    disabled={busy}
                    onChange={(on) =>
                      void run(() => (on ? grantTitle(userId, title.id) : revokeTitle(userId, title.id)))
                    }
                  >
                    {title.label}
                  </CheckListItem>
                ))}
              </CheckList>
            </div>
          ) : null}
        </div>
      )}
      {error ? (
        <Alert tone="warning" compact className="mt-3">
          {error}
        </Alert>
      ) : null}
    </Modal>
  );
}

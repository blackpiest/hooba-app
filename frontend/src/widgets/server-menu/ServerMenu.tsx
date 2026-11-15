import { useState } from "react";
import { logoutFromCurrentServer } from "@/features/server-switch/switch-server";
import { sentences } from "@/shared/lib/sentences";
import { getServerUrl, isDesktopApp } from "@/shared/lib/server-target";
import {
  ConfirmDialog,
  Counter,
  DropdownMenu,
  MenuItem,
  MenuSeparator,
  ServerHeaderButton,
} from "@/shared/ui";
import { useVoiceStore } from "@/stores/voice-store";
import { loadOtherServers } from "@/widgets/server-rail/rail-servers";

type ServerMenuAction = "invites" | "admin" | "logout";

export type ServerMenuProps = {
  name: string;
  icon: string | null;
  /** Веб: выход и переход на экран входа. Desktop выходит сам (с переходом на другой сервер). */
  onLogout: () => Promise<void>;
  /** Личные инвайты включены: пункт «Пригласить друзей». */
  invites?: { onOpen: () => void };
  /** Staff: пункт «Управление сервером», `openReports` — новые жалобы. */
  admin?: { onOpen: () => void; openReports: number };
};

/**
 * Название сервера в шапке сайдбара с меню сервера: инвайты, управление сервером (staff), выход из аккаунта.
 * Счётчик новых жалоб (staff) виден и на самой кнопке.
 */
export function ServerMenu({ name, icon, onLogout, invites, admin }: ServerMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const desktop = isDesktopApp();
  const next = confirmOpen && desktop ? (loadOtherServers(getServerUrl())[0] ?? null) : null;
  const reports = admin?.openReports ?? 0;
  const inVoice = useVoiceStore((state) => state.activeChannelId !== null);

  async function logout() {
    setBusy(true);
    try {
      if (desktop) {
        await logoutFromCurrentServer(next?.origin ?? null);
      } else {
        await onLogout();
      }
    } catch {
      setBusy(false);
    }
  }

  const indicator = reports > 0 ? <Counter value={reports} /> : null;

  return (
    <>
      <DropdownMenu
        trigger={
          <ServerHeaderButton
            name={name}
            src={icon}
            indicator={indicator}
            aria-label={reports > 0 ? `Меню сервера ${name}, новых жалоб: ${reports}` : `Меню сервера ${name}`}
          />
        }
        aria-label={`Сервер ${name}`}
        matchTriggerWidth
        onAction={(key) => {
          const action = key as ServerMenuAction;
          if (action === "invites") {
            invites?.onOpen();
          } else if (action === "admin") {
            admin?.onOpen();
          } else {
            setConfirmOpen(true);
          }
        }}
      >
        {invites ? (
          <MenuItem id="invites" icon="user-plus">
            Пригласить друзей
          </MenuItem>
        ) : null}
        {admin ? (
          <MenuItem id="admin" icon="shield" textValue="Управление сервером">
            <span className="flex items-center gap-2">
              Управление сервером
              {reports > 0 ? <Counter value={reports} /> : null}
            </span>
          </MenuItem>
        ) : null}
        {invites || admin ? <MenuSeparator /> : null}
        <MenuItem id="logout" icon="logout" danger>
          Выйти из аккаунта
        </MenuItem>
      </DropdownMenu>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void logout()}
        isPending={busy}
        tone="danger"
        title={`Выйти с сервера «${name}»?`}
        description={sentences(
          desktop ? "Сервер пропадёт из панели, для входа понадобится повторная авторизация." : "Для входа понадобится повторная авторизация.",
          inVoice && "Вы выйдете из голосового канала.",
          next && `Откроется «${next.name}».`,
        )}
        confirmLabel="Выйти"
      />
    </>
  );
}

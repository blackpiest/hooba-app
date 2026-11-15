import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  logoutFromCurrentServer,
  logoutFromOtherServer,
  openAddServer,
  switchToServer,
} from "@/features/server-switch/switch-server";
import { sentences } from "@/shared/lib/sentences";
import { getServerUrl, selectServer } from "@/shared/lib/server-target";
import { ConfirmDialog, ContextMenu, MenuItem } from "@/shared/ui";
import { useVoiceStore } from "@/stores/voice-store";
import { hostLabel, loadOtherServers, withCurrentServer, type RailServer } from "./rail-servers";
import { RailColumn } from "./RailColumn";

type Pending =
  | { kind: "switch"; server: RailServer }
  | { kind: "logout"; server: RailServer }
  | { kind: "add" };

type MenuTarget = { server: RailServer; x: number; y: number };

export type ServerRailProps = {
  /**
   * Открытый сервер (оболочка приложения): его плитка активна, переключение отключает от него.
   * `null` — экран входа на ещё один сервер: активна плитка «+», ни к одному серверу не подключены.
   */
  active: { name: string; icon: string | null } | null;
  /** Кнопка настроек приложения внизу панели (они общие для всех серверов). */
  onSettings?: () => void;
  /** Шестерёнка без `onSettings` — неактивная (экран загрузки сервера), чтобы низ панели не менялся. */
  showSettings?: boolean;
};

/**
 * Панель серверов слева (только desktop): серверы, где есть вход с этого компьютера. Активен всегда один:
 * переключение отключает от текущего (голос, сокет) и открывает приложение на выбранном. На экране входа
 * (`active = null`) отключаться не от чего — переход сразу, без подтверждения.
 * ПКМ по серверу — «Переключиться» (кроме текущего) и «Выйти с сервера».
 */
export function ServerRail({ active, onSettings, showSettings }: ServerRailProps) {
  const current = active ? getServerUrl() : null;
  const currentName = active?.name ?? null;
  const currentIcon = active?.icon ?? null;
  const inVoice = useVoiceStore((state) => state.activeChannelId !== null);
  const navigate = useNavigate();
  // С экрана входа ни к одному серверу не подключены — перезагрузка не нужна, панель и код остаются на месте.
  const openFromAuth = (origin: string) => {
    selectServer(origin);
    navigate("/app", { replace: true });
  };
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  // Меняется только выходом с другого сервера из меню.
  const [others, setOthers] = useState<RailServer[]>(() => loadOtherServers(current));

  const servers = useMemo<RailServer[]>(
    () =>
      withCurrentServer(
        others,
        current && currentName !== null ? { origin: current, name: currentName, icon: currentIcon } : null,
      ),
    [others, current, currentName, currentIcon],
  );

  async function confirm() {
    if (!pending) {
      return;
    }
    setBusy(true);
    if (pending.kind === "switch") {
      switchToServer(pending.server.origin);
      return;
    }
    if (pending.kind === "add") {
      openAddServer();
      return;
    }
    const { origin } = pending.server;
    if (origin === current) {
      await logoutFromCurrentServer(others[0]?.origin ?? null);
      return;
    }
    try {
      await logoutFromOtherServer(origin);
      if (!active && origin === getServerUrl()) {
        // Экран входа считал, что к этому серверу можно вернуться, — открываем его заново.
        window.location.reload();
        return;
      }
    } finally {
      setOthers(loadOtherServers(current));
      setBusy(false);
      setPending(null);
    }
  }

  const dialog = dialogText(pending, current, currentName, inVoice, others[0]?.name ?? null);

  return (
    <RailColumn
      servers={servers}
      current={current}
      onServer={(server) => (active ? setPending({ kind: "switch", server }) : openFromAuth(server.origin))}
      onServerContextMenu={(server, event) => setMenu({ server, x: event.clientX, y: event.clientY })}
      onPlus={active ? () => setPending({ kind: "add" }) : undefined}
      onSettings={onSettings}
      showSettings={showSettings}
    >
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          aria-label={`Сервер ${menu.server.name}`}
          onAction={(key) => {
            const server = menu.server;
            if (key === "switch" && !active) {
              openFromAuth(server.origin);
              return;
            }
            setPending(key === "switch" ? { kind: "switch", server } : { kind: "logout", server });
          }}
        >
          {menu.server.origin !== current ? (
            <MenuItem id="switch" icon="arrow-right">
              Переключиться на сервер
            </MenuItem>
          ) : null}
          <MenuItem id="logout" icon="logout" danger>
            Выйти с сервера
          </MenuItem>
        </ContextMenu>
      ) : null}
      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void confirm()}
        isPending={busy}
        title={dialog.title}
        description={dialog.description}
        confirmLabel={dialog.confirmLabel}
        tone={pending?.kind === "logout" ? "danger" : "default"}
      />
    </RailColumn>
  );
}

const VOICE_NOTE = "Вы выйдете из голосового канала.";
const RELOGIN_NOTE = "Сервер пропадёт из панели, для входа понадобится повторная авторизация.";

function dialogText(
  pending: Pending | null,
  current: string | null,
  currentName: string | null,
  inVoice: boolean,
  nextName: string | null,
): { title: string; description: string; confirmLabel: string } {
  if (!pending) {
    return { title: "", description: "", confirmLabel: "" };
  }
  const leave = sentences(currentName ? `Вы временно отключитесь от «${currentName}».` : null, inVoice && VOICE_NOTE);
  if (pending.kind === "add") {
    return { title: "Войти на другой сервер?", description: leave, confirmLabel: "Продолжить" };
  }
  const { server } = pending;
  if (pending.kind === "switch") {
    return {
      title: `Перейти на «${server.name}»?`,
      description: leave || sentences(`Откроется сервер ${hostLabel(server.origin)}.`),
      confirmLabel: "Перейти",
    };
  }
  const isCurrent = server.origin === current;
  return {
    title: `Выйти с сервера «${server.name}»?`,
    description: sentences(
      RELOGIN_NOTE,
      isCurrent && inVoice && VOICE_NOTE,
      isCurrent && nextName ? `Откроется «${nextName}».` : null,
    ),
    confirmLabel: "Выйти",
  };
}

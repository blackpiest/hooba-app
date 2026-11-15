import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openAddServer } from "@/features/server-switch/switch-server";
import { getAccessToken, getRefreshToken } from "@/shared/lib/auth-storage";
import { getServerUrl, isDesktopApp, type DesktopDeepLink } from "@/shared/lib/server-target";
import { ConfirmDialog } from "@/shared/ui";

function linkTarget(link: DesktopDeepLink): { path: string; params: URLSearchParams } {
  const params = new URLSearchParams({ server: link.server });
  if (link.kind === "login") {
    return { path: "/login", params };
  }
  if (link.invite) {
    params.set("invite", link.invite);
  }
  return { path: "/register", params };
}

function linkPath(link: DesktopDeepLink): string {
  const { path, params } = linkTarget(link);
  return `${path}?${params.toString()}`;
}

function serverLabel(server: string): string {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
}

function sameServer(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Ссылка hooba://register?server=…[&invite=…] или hooba://login?server=… из десктопа:
 * открывает регистрацию или вход с подставленными адресом (и кодом).
 * Если сессия уже есть — спрашивает, отключиться ли от текущего сервера (вход на нём сохраняется, вернуться можно
 * в панели серверов); вход на тот же сервер просто игнорируется.
 */
export function InviteDeepLinkHandler() {
  const navigate = useNavigate();
  const [link, setLink] = useState<DesktopDeepLink | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) {
      return;
    }
    const take = () => {
      void window.hoobaDesktop?.takeDeepLink?.().then((next) => {
        if (!next) {
          return;
        }
        if (getAccessToken() || getRefreshToken()) {
          const current = getServerUrl();
          if (next.kind === "login" && current && sameServer(current, next.server)) {
            return;
          }
          setLink(next);
          return;
        }
        navigate(linkPath(next), { replace: true });
      });
    };
    take();
    return window.hoobaDesktop?.onDeepLink?.(take);
  }, [navigate]);

  function confirm() {
    if (!link) {
      return;
    }
    setPending(true);
    const { path, params } = linkTarget(link);
    openAddServer(path, params);
  }

  return (
    <ConfirmDialog
      isOpen={link !== null}
      onClose={() => setLink(null)}
      onConfirm={confirm}
      title="Перейти на другой сервер?"
      description={
        link
          ? link.kind === "login"
            ? `Ссылка на вход на сервер ${serverLabel(link.server)}. Вы отключитесь от текущего сервера, вход на нём сохранится — вернуться можно в панели серверов слева.`
            : `Ссылка-приглашение на сервер ${serverLabel(link.server)}. Вы отключитесь от текущего сервера, вход на нём сохранится — вернуться можно в панели серверов слева.`
          : undefined
      }
      confirmLabel="Перейти"
      isPending={pending}
    />
  );
}

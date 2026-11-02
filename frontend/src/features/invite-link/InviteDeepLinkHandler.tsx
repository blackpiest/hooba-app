import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "@/shared/api/auth";
import { getAccessToken, getRefreshToken } from "@/shared/lib/auth-storage";
import { getServerUrl, isDesktopApp, type DesktopDeepLink } from "@/shared/lib/server-target";
import { ConfirmDialog } from "@/shared/ui";

function linkPath(link: DesktopDeepLink): string {
  const params = new URLSearchParams({ server: link.server });
  if (link.kind === "login") {
    return `/login?${params.toString()}`;
  }
  if (link.invite) {
    params.set("invite", link.invite);
  }
  return `/register?${params.toString()}`;
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
 * Если сессия уже есть — сначала спрашивает, можно ли выйти из текущего аккаунта; вход на тот же сервер просто игнорируется.
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

  async function confirm() {
    if (!link) {
      return;
    }
    setPending(true);
    try {
      await logout();
      navigate(linkPath(link), { replace: true });
      setLink(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <ConfirmDialog
      isOpen={link !== null}
      onClose={() => setLink(null)}
      onConfirm={() => void confirm()}
      title="Выйти из аккаунта?"
      description={
        link
          ? link.kind === "login"
            ? `Ссылка на вход на сервер ${serverLabel(link.server)}. Чтобы войти, нужно выйти из текущего аккаунта.`
            : `Ссылка-приглашение на сервер ${serverLabel(link.server)}. Чтобы зарегистрироваться, нужно выйти из текущего аккаунта.`
          : undefined
      }
      confirmLabel="Выйти"
      tone="danger"
      isPending={pending}
    />
  );
}

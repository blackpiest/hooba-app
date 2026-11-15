import { leaveVoiceChannel } from "@/features/voice/voice-session/voice-session";
import { logout } from "@/shared/api/auth";
import { disconnectAppRealtime } from "@/shared/ws/app-realtime";
import { clearStoredSession, getStoredRefreshToken } from "@/shared/lib/auth-storage";
import { getServerUrl, selectServer } from "@/shared/lib/server-target";
import { ADD_SERVER_PARAM } from "./add-server-mode";

/** Выйти из голоса и закрыть сокет текущего сервера: участники сразу видят уход, а не ждут таймаута. */
export function detachFromCurrentServer(): void {
  try {
    leaveVoiceChannel();
  } catch {
    // голос уже разобран — не мешает переключению
  }
  disconnectAppRealtime();
  // Перезагрузка не размонтирует React: оверлей голоса, бейдж трансляции и метку трея гасим сами.
  const desktop = window.hoobaDesktop;
  desktop?.publishVoiceOverlay?.(null);
  desktop?.publishLiveBadge?.(false);
  desktop?.setTrayAttention?.(false);
}

/**
 * Переключение на другой сервер, где уже есть вход: отключаемся от текущего и перезагружаем приложение —
 * все сторы, подписки и медиа начинаются с чистого листа, как при обычном запуске.
 */
export function switchToServer(origin: string): void {
  detachFromCurrentServer();
  selectServer(origin);
  window.location.assign("/app");
}

/**
 * Вход на ещё один сервер: отключаемся от текущего, вход на нём остаётся (к нему можно вернуться).
 * `path` — `/login` или `/register` с параметрами (адрес сервера, инвайт из ссылки hooba://).
 */
export function openAddServer(path = "/login", params?: URLSearchParams): void {
  detachFromCurrentServer();
  const query = new URLSearchParams(params);
  query.set(ADD_SERVER_PARAM, "1");
  window.location.assign(`${path}?${query.toString()}`);
}

/**
 * Выход из аккаунта на неактивном сервере: отзываем refresh-сессию на нём и стираем его токены.
 * Сеть не ответила — локальный вход всё равно удалён (как у обычного выхода).
 */
export async function logoutFromOtherServer(origin: string): Promise<void> {
  const refresh = getStoredRefreshToken(origin);
  clearStoredSession(origin);
  if (!refresh) {
    return;
  }
  try {
    await fetch(`${origin}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    /* сервер недоступен или не ответил за 5 с — локальная сессия уже сброшена */
  }
}

/**
 * Выход из аккаунта на текущем сервере. Если есть вход на другом (`next`) — переходим туда, иначе на страницу входа.
 */
export async function logoutFromCurrentServer(next: string | null): Promise<void> {
  detachFromCurrentServer();
  await logout();
  if (next && next !== getServerUrl()) {
    selectServer(next);
    window.location.assign("/app");
    return;
  }
  window.location.assign("/login");
}

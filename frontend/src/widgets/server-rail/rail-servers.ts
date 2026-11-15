import { hasStoredSession } from "@/shared/lib/auth-storage";
import { getServerHistory, getServerProfiles, getServerUrl, isDesktopApp } from "@/shared/lib/server-target";

export type RailServer = { origin: string; name: string; icon: string | null };

export function hostLabel(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/** Серверы с сохранённым входом, кроме `exclude` (открытого сейчас), в порядке первого входа. */
export function loadOtherServers(exclude: string | null): RailServer[] {
  const known: RailServer[] = getServerProfiles().map(({ origin, name, icon }) => ({ origin, name, icon }));
  // Вход был до появления панели: профиля ещё нет — показываем адрес, название подтянется после перехода.
  for (const origin of getServerHistory()) {
    if (!known.some((item) => item.origin === origin)) {
      known.push({ origin, name: hostLabel(origin), icon: null });
    }
  }
  return known.filter((item) => item.origin !== exclude && hasStoredSession(item.origin));
}

/** Название и аватар открытого сервера из сохранённого профиля — пока сервер не ответил (экран загрузки). */
export function currentServerCard(): { name: string; icon: string | null } | null {
  const origin = getServerUrl();
  if (!isDesktopApp() || !origin) {
    return null;
  }
  const profile = getServerProfiles().find((item) => item.origin === origin);
  return { name: profile?.name ?? hostLabel(origin), icon: profile?.icon ?? null };
}

/** Есть ли что показать в панели на экране входа (desktop): хотя бы один сервер с сохранённым входом. */
export function hasRailServers(): boolean {
  return isDesktopApp() && loadOtherServers(null).length > 0;
}

/** Открытый сервер среди остальных — в порядке первого входа (порядок не прыгает при переключениях). */
export function withCurrentServer(others: RailServer[], current: RailServer | null): RailServer[] {
  if (!current) {
    return others;
  }
  const order = getServerProfiles().map((profile) => profile.origin);
  const rank = (origin: string) => {
    const index = order.indexOf(origin);
    return index < 0 ? order.length : index;
  };
  return [...others, current].sort((a, b) => rank(a.origin) - rank(b.origin));
}

/** Обёртка панели на экранах входа и регистрации: отделена от формы линией. */
export const AUTH_RAIL_CLASS = "flex shrink-0 border-r border-line bg-bg pl-1";

import { matchPath, useLocation } from "react-router-dom";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { getServerUrl, isDesktopApp } from "@/shared/lib/server-target";
import { AUTH_RAIL_CLASS, currentServerCard, hasRailServers, loadOtherServers, withCurrentServer } from "./rail-servers";
import { RailColumn } from "./RailColumn";

/**
 * Панель серверов на сплэше, пока грузится код приложения (desktop): та же разметка без действий.
 * Живая панель с меню и переключением приходит вместе с приложением и встаёт на её место.
 * Лёгкая: без голоса и сокета, иначе потянула бы их в первый чанк.
 */
export function ServerRailPreview() {
  const { pathname } = useLocation();
  const wide = useBreakpoint("md");
  if (!isDesktopApp() || !wide) {
    return null;
  }
  if (matchPath("/login", pathname) || matchPath("/register", pathname)) {
    if (!hasRailServers()) {
      return null;
    }
    return (
      <div className={AUTH_RAIL_CLASS}>
        <RailColumn servers={loadOtherServers(null)} current={null} isStatic />
      </div>
    );
  }
  if (matchPath("/app/*", pathname)) {
    const origin = getServerUrl();
    const card = currentServerCard();
    if (!origin || !card) {
      return null;
    }
    const servers = withCurrentServer(loadOtherServers(origin), { origin, ...card });
    return <RailColumn servers={servers} current={origin} showSettings isStatic />;
  }
  return null;
}

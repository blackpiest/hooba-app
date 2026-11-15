import { useState } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { AUTH_RAIL_CLASS, hasRailServers } from "./rail-servers";
import { ServerRail } from "./ServerRail";

/**
 * Панель серверов на экранах входа и регистрации (desktop): если на этом компьютере есть вход хотя бы
 * на один сервер, к нему можно вернуться, не входя заново. На первичной настройке сервера не показывается.
 */
export function AuthServerRail() {
  const { pathname } = useLocation();
  const wide = useBreakpoint("md");
  // Список меняется только выходом из меню панели — тогда страница перезагружается.
  const [visible] = useState(hasRailServers);
  const onAuthPage = matchPath("/login", pathname) !== null || matchPath("/register", pathname) !== null;
  if (!visible || !wide || !onAuthPage) {
    return null;
  }
  return (
    <div className={AUTH_RAIL_CLASS}>
      <ServerRail active={null} />
    </div>
  );
}

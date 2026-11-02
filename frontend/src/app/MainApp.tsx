import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthLayout } from "../shared/ui/auth-shell/AuthShell";
import { AppChannelsIndexRedirect } from "../pages/app/AppChannelsIndexRedirect";
import { AppShellLayout } from "../pages/app/AppShellLayout";
import { ChannelViewPage } from "../pages/app/ChannelViewPage";
import { HomeRedirect } from "../pages/HomeRedirect";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { RegisterPage } from "../pages/RegisterPage";
import { SetupPage } from "../pages/SetupPage";
import { InviteDeepLinkHandler } from "../features/invite-link/InviteDeepLinkHandler";
import { DesktopUpdateNotice } from "../widgets/desktop-update/DesktopUpdateNotice";
import { ReleaseNotesDialog } from "../widgets/release-notes";
import { WindowControls } from "../widgets/window-controls/WindowControls";

/** Витрина UI-кита — только в dev-сборке (в прод-бандл не попадает). */
const KitPage = import.meta.env.DEV
  ? lazy(() => import("../pages/dev/KitPage").then((m) => ({ default: m.KitPage })))
  : null;

/** Всё приложение, кроме окон оверлея и бейджа. Отдельный чанк: те окна его не грузят. */
export default function MainApp() {
  useEffect(() => {
    const blockNativeMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("contextmenu", blockNativeMenu);
    return () => document.removeEventListener("contextmenu", blockNativeMenu);
  }, []);

  return (
    <div className="min-h-dvh">
      <WindowControls />
      <DesktopUpdateNotice />
      <ReleaseNotesDialog />
      <InviteDeepLinkHandler />
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route path="/app" element={<AppShellLayout />}>
          <Route path="channels/:channelId" element={<ChannelViewPage />} />
          <Route index element={<AppChannelsIndexRedirect />} />
        </Route>
        {KitPage ? (
          <Route
            path="/dev/kit"
            element={
              <Suspense fallback={null}>
                <KitPage />
              </Suspense>
            }
          />
        ) : null}
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { LiveBadgePage } from "../features/screenshare/LiveBadgePage";
import { VoiceOverlayPage } from "../features/voice/voice-overlay/VoiceOverlayPage";
import { ToastsPage } from "../features/desktop-toasts/ToastsPage";
import { AppErrorBoundary } from "../shared/ui/app-error-boundary/AppErrorBoundary";
import { BootSplash } from "../shared/ui/boot-splash/BootSplash";

/** Окна `/overlay`, `/live` и `/toasts` в десктопе — отдельные renderer-процессы. Без lazy каждый парсил бы весь бандл (~1.2 МБ). */
const MainApp = lazy(() => import("./MainApp"));

export function App() {
  const { pathname } = useLocation();
  if (pathname === "/overlay") {
    return <VoiceOverlayPage />;
  }
  if (pathname === "/live") {
    return <LiveBadgePage />;
  }
  if (pathname === "/toasts") {
    return <ToastsPage />;
  }
  return (
    <AppErrorBoundary>
      <Suspense fallback={<BootSplash />}>
        <MainApp />
      </Suspense>
    </AppErrorBoundary>
  );
}

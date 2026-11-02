import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { App } from './app/App';
import { applyTheme } from './shared/theme/theme';
import { installCrossTabSessionSync } from './shared/ws/app-realtime';
import { registerServiceWorker } from './app/register-service-worker';
import { installTouchSoundUnlock } from './features/voice/touch-sound-player';
import { isTouchInput } from './hooks/use-breakpoint';

installCrossTabSessionSync();
applyTheme();
registerServiceWorker();
// Телефон: звук разблокируется первым же касанием — уведомления потом играют без нажатия.
if (isTouchInput()) {
  installTouchSoundUnlock();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

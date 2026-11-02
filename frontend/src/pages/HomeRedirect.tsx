import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSetupStatus } from '../shared/api/setup';
import { getAccessToken, getRefreshToken } from '../shared/lib/auth-storage';
import { getServerUrl, isDesktopApp } from '../shared/lib/server-target';
import { Button, EmptyState, MarkLoader, Slime } from '@/shared/ui';

export function HomeRedirect() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Сессия уже есть: сразу в приложение, не заходя на /login (иначе форма входа мелькает до его редиректа).
      if (getAccessToken() || getRefreshToken()) {
        navigate('/app', { replace: true });
        return;
      }
      if (isDesktopApp() && !getServerUrl()) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const { isBootstrapped } = await fetchSetupStatus();
        if (cancelled) return;
        navigate(isBootstrapped ? '/login' : '/setup', { replace: true });
      } catch (e: unknown) {
        if (cancelled) return;
        if (isDesktopApp()) {
          navigate('/login', {
            replace: true,
            state: { notice: 'Не удалось связаться с сервером. Проверьте адрес.' },
          });
          return;
        }
        const msg = e instanceof Error ? e.message : 'Не удалось получить статус сервера';
        setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-8">
        <EmptyState
          className="max-w-md"
          illustration={<Slime pose="offline" />}
          title="Нет связи с сервером"
          description={`${error}. Проверьте, что backend запущен и VITE_API_URL верен.`}
          action={<Button onPress={() => window.location.reload()}>Повторить</Button>}
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <MarkLoader size="lg" />
    </main>
  );
}

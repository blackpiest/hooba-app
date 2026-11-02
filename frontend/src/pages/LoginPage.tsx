import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../shared/api/auth';
import { formatApiError } from '../shared/api/format-error';
import { getAccessToken, getRefreshToken } from '../shared/lib/auth-storage';
import { buildLandingUrl, openDesktopAppOrLanding } from '../shared/lib/open-desktop-app';
import { buildAppLoginLink, commitServerAddress, getServerUrl, isDesktopApp } from '../shared/lib/server-target';
import { AuthShell } from '../shared/ui/auth-shell/AuthShell';
import { ServerAddressField } from '../shared/ui/server-address-field/ServerAddressField';
import { playAuthSuccessSound } from '@/features/ui-sounds/ui-sounds';
import { Alert, Button, Dialogue, PasswordField, TextField, linkClass } from '@/shared/ui';
import { useIsTouch } from '@/hooks/use-breakpoint';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const notice =
    location.state &&
    typeof location.state === 'object' &&
    'notice' in location.state &&
    typeof location.state.notice === 'string'
      ? location.state.notice
      : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const isTouch = useIsTouch();
  const [serverAddress, setServerAddress] = useState(() =>
    isDesktopApp() ? (searchParams.get('server') ?? getServerUrl() ?? '') : '',
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Ссылка hooba://login могла прийти, пока форма уже открыта: переносим адрес в поле прямо при рендере.
  const incomingServer = searchParams.get('server');
  const [appliedServer, setAppliedServer] = useState<string | null>(null);
  if (incomingServer !== null && incomingServer !== appliedServer) {
    setAppliedServer(incomingServer);
    if (isDesktopApp()) {
      setServerAddress(incomingServer);
      setServerError(null);
    }
  }

  // Сам параметр из адресной строки убираем.
  useEffect(() => {
    if (!searchParams.has('server')) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('server');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const hasSession = Boolean(getAccessToken() || getRefreshToken());

  useEffect(() => {
    if (hasSession) {
      navigate('/app', { replace: true });
    }
  }, [hasSession, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setServerError(null);
    setLoading(true);
    try {
      if (isDesktopApp()) {
        try {
          await commitServerAddress(serverAddress);
        } catch (err: unknown) {
          setServerError(err instanceof Error ? err.message : 'Ошибка подключения');
          return;
        }
      }
      await login(username, password);
      playAuthSuccessSound();
      navigate('/app', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? formatApiError(err.message, 'Ошибка входа') : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  // Идёт редирект в приложение — форму входа не показываем.
  if (hasSession) {
    return null;
  }

  const desktop = isDesktopApp();

  return (
    <AuthShell
      title={desktop ? 'Вход на сервер' : 'С возвращением!'}
      above={
        desktop ? (
          <Dialogue lines={['Введите логин и пароль, который указывали при регистрации на выбранном сервере']} />
        ) : isTouch ? undefined : (
          <Dialogue
            lines={['В приложении Hooba больше функций, продолжите авторизацию в нём']}
            actions={
              <Button
                size="sm"
                variant="secondary"
                onPress={() =>
                  openDesktopAppOrLanding(buildAppLoginLink(window.location.origin), buildLandingUrl('web_login'))
                }
              >
                Открыть
              </Button>
            }
          />
        )
      }
      footer={
        <>
          Нет аккаунта?{' '}
          <Link to="/register" draggable={false} className={linkClass}>
            Регистрация по инвайту
          </Link>
        </>
      }
    >
      {notice ? (
        <Alert tone="warning" compact className="mb-4">
          {notice}
        </Alert>
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <ServerAddressField
          value={serverAddress}
          onChange={(value) => {
            setServerAddress(value);
            setServerError(null);
          }}
          error={serverError}
        />
        <TextField
          label="Логин"
          value={username}
          onChange={setUsername}
          placeholder="username"
          autoComplete="username"
          isRequired
        />
        <PasswordField
          label="Пароль"
          value={password}
          onChange={setPassword}
          placeholder="********"
          autoComplete="current-password"
          isRequired
        />
        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
        <Button type="submit" fullWidth isPending={loading}>
          Войти
        </Button>
      </form>
    </AuthShell>
  );
}

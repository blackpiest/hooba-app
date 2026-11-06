import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../shared/ui/auth-shell/AuthShell';
import { ServerAddressField } from '../shared/ui/server-address-field/ServerAddressField';
import { register } from '../shared/api/auth';
import { formatApiError } from '../shared/api/format-error';
import { buildAppInviteLink, commitServerAddress, getServerUrl, isDesktopApp } from '../shared/lib/server-target';
import { canPeekClipboard, canReadClipboard, readClipboardText } from '../shared/lib/clipboard';
import { buildLandingUrl, openDesktopAppOrLanding } from '../shared/lib/open-desktop-app';
import { playAuthSuccessSound } from '@/features/ui-sounds/ui-sounds';
import { Alert, Button, Dialogue, PasswordField, TextField, linkClass } from '@/shared/ui';
import { useIsTouch } from '@/hooks/use-breakpoint';

const validateUsername = (value: string) => (/^[a-zA-Z0-9_-]+$/.test(value) ? null : 'Буквы, цифры, _ и -');

const INVITE_FORMAT_ERROR = 'Некорректный формат инвайт-кода';

/**
 * Вставленный текст: ссылка-инвайт (`…/register?invite=CODE`, `hooba://register?…`) → код из параметра;
 * любая другая ссылка → ошибка; не ссылка → как есть.
 */
function parsePastedInvite(text: string): { value: string } | { error: string } {
  const trimmed = text.trim();
  const looksLikeLink = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(trimmed) || /^\/?register\?\S*$/i.test(trimmed);
  if (!looksLikeLink) {
    return { value: text };
  }
  try {
    const url = new URL(trimmed, 'http://invite.local');
    const isRegister = url.pathname.replace(/\/+$/, '').endsWith('/register') || url.hostname === 'register';
    const code = url.searchParams.get('invite')?.trim();
    return isRegister && code ? { value: code } : { error: INVITE_FORMAT_ERROR };
  } catch {
    return { error: INVITE_FORMAT_ERROR };
  }
}

/** Ошибка текущего значения поля: в нём осталась ссылка, не являющаяся ссылкой-инвайтом. */
function inviteCodeError(value: string): string | null {
  const parsed = parsePastedInvite(value);
  return 'error' in parsed ? parsed.error : null;
}

/**
 * Поле инвайт-кода: кнопка «Вставить» видна, пока поле пустое и буфер доступен.
 * Следить за буфером может только desktop: в вебе Firefox и Safari на каждое чтение показывают
 * своё меню «Вставить», поэтому там читаем только по нажатию кнопки.
 */
function InviteCodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canPeek = canPeekClipboard();
  // undefined — ещё не читали; null — прочитать не удалось (в вебе браузер закрыл доступ), кнопка скрыта.
  const [clipboard, setClipboard] = useState<string | null | undefined>(() => (canReadClipboard() ? undefined : null));

  // Невалидная ссылка остаётся в поле для наглядности: ошибка выводится из значения и блокирует отправку.
  const applyPasted = (text: string) => {
    const parsed = parsePastedInvite(text);
    onChange('value' in parsed ? parsed.value : text);
  };

  // Любой путь ввода (Ctrl+V, контекстное меню, перетаскивание) приходит как onChange: прирост >1 символа считаем вставкой.
  const handleChange = (next: string) => {
    if (next.length - value.length > 1) {
      applyPasted(next);
    } else {
      onChange(next);
    }
  };

  const refreshClipboard = useCallback(async () => {
    const text = await readClipboardText();
    setClipboard(text === null ? null : text.trim());
  }, []);

  useEffect(() => {
    if (!canPeek) {
      return;
    }
    let alive = true;
    void readClipboardText().then((text) => {
      if (alive) {
        setClipboard(text === null ? null : text.trim());
      }
    });
    // Скопированное в адресной строке или другом окне не всегда даёт focus на странице: опрашиваем буфер, пока вкладка активна.
    const poll = window.setInterval(() => {
      if (document.hasFocus()) {
        void refreshClipboard();
      }
    }, 1000);
    window.addEventListener('focus', refreshClipboard);
    document.addEventListener('visibilitychange', refreshClipboard);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.removeEventListener('focus', refreshClipboard);
      document.removeEventListener('visibilitychange', refreshClipboard);
    };
  }, [canPeek, refreshClipboard]);

  return (
    <TextField
      label="Инвайт-код"
      value={value}
      onChange={handleChange}
      error={inviteCodeError(value)}
      onFocus={() => {
        if (canPeek) {
          void refreshClipboard();
        }
      }}
      placeholder="код приглашения"
      autoComplete="off"
      mono
      isRequired
      trailingWide
      trailing={
        clipboard === null || value.trim() ? undefined : (
          <Button
            variant="secondary"
            size="sm"
            isDisabled={canPeek && !clipboard}
            onPress={async () => {
              const text = await readClipboardText();
              if (text === null) {
                setClipboard(null);
              } else if (text.trim()) {
                applyPasted(text.trim());
              }
            }}
          >
            Вставить
          </Button>
        )
      }
    />
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isTouch = useIsTouch();
  const [serverAddress, setServerAddress] = useState(() =>
    isDesktopApp() ? (searchParams.get('server') ?? getServerUrl() ?? '') : '',
  );
  const [inviteCode, setInviteCode] = useState(() => searchParams.get('invite') ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Отказ сервера по логину (фильтр слов) — под полем «Логин».
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Ссылка могла прийти, пока форма уже открыта: переносим параметры в поля прямо при рендере.
  const incomingInvite = searchParams.get('invite');
  const incomingServer = searchParams.get('server');
  const [appliedLink, setAppliedLink] = useState<string | null>(null);
  const linkKey = incomingInvite === null && incomingServer === null ? null : `${incomingServer}|${incomingInvite}`;
  if (linkKey !== null && linkKey !== appliedLink) {
    setAppliedLink(linkKey);
    if (incomingInvite !== null) {
      setInviteCode(incomingInvite);
    }
    if (incomingServer !== null && isDesktopApp()) {
      setServerAddress(incomingServer);
      setServerError(null);
    }
  }

  // Сами параметры из адресной строки убираем.
  useEffect(() => {
    if (!searchParams.has('invite') && !searchParams.has('server')) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('invite');
    next.delete('server');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (inviteCodeError(inviteCode) !== null) {
      return;
    }
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
      await register(inviteCode.trim(), username.trim(), password);
      playAuthSuccessSound();
      navigate('/app', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? formatApiError(err.message, 'Ошибка регистрации') : 'Ошибка регистрации';
      if (err instanceof Error && err.message.startsWith('USERNAME_FORBIDDEN')) {
        setUsernameError(message);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Регистрация"
      above={
        // Телефон и планшет: десктоп-приложение туда не поставить — предложение открыть его не показываем.
        isTouch ? undefined : !isDesktopApp() ? (
          <Dialogue
            lines={['В приложении Hooba больше функций, продолжите регистрацию в нём']}
            actions={
              <Button
                size="sm"
                variant="secondary"
                onPress={() =>
                  openDesktopAppOrLanding(
                    buildAppInviteLink(window.location.origin, inviteCode.trim()),
                    buildLandingUrl('web_reg'),
                  )
                }
              >
                Открыть
              </Button>
            }
          />
        ) : (
          <Dialogue
            lines={[
              'Регистрация на сервере возможна только по приглашению. Если на этом сервере есть ваши друзья, попросите их скинуть вам инвайт-ссылку.',
            ]}
          />
        )
      }
      footer={
        <>
          Уже есть аккаунт?{' '}
          <Link to="/login" draggable={false} className={linkClass}>
            Вход
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <ServerAddressField
          value={serverAddress}
          onChange={(value) => {
            setServerAddress(value);
            setServerError(null);
          }}
          error={serverError}
        />
        <InviteCodeField value={inviteCode} onChange={setInviteCode} />
        <TextField
          label="Логин"
          value={username}
          onChange={(value) => {
            setUsername(value);
            setUsernameError(null);
          }}
          error={usernameError}
          placeholder="username"
          autoComplete="username"
          minLength={3}
          maxLength={32}
          validate={validateUsername}
          isRequired
        />
        <PasswordField
          label="Пароль"
          value={password}
          onChange={setPassword}
          placeholder="********"
          hint="Минимум 8 символов"
          autoComplete="new-password"
          minLength={8}
          isRequired
        />
        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
        <Button type="submit" fullWidth isPending={loading}>
          Создать аккаунт
        </Button>
      </form>
    </AuthShell>
  );
}

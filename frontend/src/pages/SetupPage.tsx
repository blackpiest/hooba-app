import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatApiError } from '../shared/api/format-error';
import { postBootstrap, uploadSetupIcon } from '../shared/api/setup';
import { AuthShell } from '../shared/ui/auth-shell/AuthShell';
import { Alert, Button, PasswordField, TextField } from '@/shared/ui';
import { ServerIconPicker } from '@/widgets/server-icon-picker/ServerIconPicker';

const validateUsername = (value: string) => (/^[a-zA-Z0-9_-]+$/.test(value) ? null : 'Буквы, цифры, _ и -');

export function SetupPage() {
  const navigate = useNavigate();
  const [setupToken, setSetupToken] = useState('');
  const [serverName, setServerName] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  /** Аватар (уже сжатый) уходит перед bootstrap: плохой файл не оставит сервер наполовину настроенным. */
  const [icon, setIcon] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
  }, [iconPreview]);

  function chooseIcon(next: File | null) {
    setIcon(next);
    setIconPreview(next ? URL.createObjectURL(next) : null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (icon) {
        await uploadSetupIcon(icon, setupToken);
      }
      await postBootstrap({
        setup_token: setupToken,
        server_name: serverName,
        owner_username: ownerUsername,
        owner_password: ownerPassword,
      });
      navigate('/login', {
        replace: true,
        state: {
          notice: 'Сервер создан. Войдите как владелец, затем выдайте инвайт в боковой панели.',
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? formatApiError(err.message) : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Первичная настройка" subtitle="Создайте сервер и учётную запись владельца.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="Токен настройки"
          value={setupToken}
          onChange={setSetupToken}
          autoComplete="off"
          minLength={16}
          maxLength={256}
          isRequired
        />
        <TextField
          label="Название сервера"
          value={serverName}
          onChange={setServerName}
          autoComplete="organization"
          minLength={3}
          maxLength={50}
          isRequired
        />
        <div className="flex flex-col gap-2">
          <p className="font-label text-[10px] uppercase leading-snug tracking-[0.06em] text-muted">Аватар сервера</p>
          <ServerIconPicker
            name={serverName}
            src={iconPreview}
            onChange={chooseIcon}
            onRemove={() => chooseIcon(null)}
            isDisabled={loading}
          />
        </div>
        <TextField
          label="Логин владельца"
          value={ownerUsername}
          onChange={setOwnerUsername}
          autoComplete="username"
          minLength={3}
          maxLength={32}
          validate={validateUsername}
          isRequired
        />
        <PasswordField
          label="Пароль владельца"
          value={ownerPassword}
          onChange={setOwnerPassword}
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
          Завершить настройку
        </Button>
      </form>
    </AuthShell>
  );
}

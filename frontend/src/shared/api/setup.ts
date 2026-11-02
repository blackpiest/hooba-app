import { apiUrl, parseJsonBody, type ApiError, type ApiSuccess } from './http';

/** Публичный статус: только факт настройки (название и аватар сервера — только после входа). */
export type SetupStatus = { isBootstrapped: boolean };

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await fetch(apiUrl('/api/v1/setup/status'));
  const json = (await parseJsonBody(res)) as ApiSuccess<SetupStatus> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
  return json.data;
}

export async function postBootstrap(body: {
  setup_token: string;
  server_name: string;
  owner_username: string;
  owner_password: string;
}): Promise<void> {
  const res = await fetch(apiUrl('/api/v1/setup/bootstrap'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await parseJsonBody(res)) as ApiSuccess<unknown> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
}

/** Аватар до bootstrap: владельца ещё нет, доступ по setup-токену. Вызывать перед `postBootstrap`. */
export async function uploadSetupIcon(file: File, setupToken: string): Promise<void> {
  const body = new FormData();
  body.append('file', file, file.name || 'icon.png');
  const res = await fetch(apiUrl('/api/v1/setup/icon'), {
    method: 'PUT',
    headers: { 'X-Setup-Token': setupToken },
    body,
  });
  const json = (await parseJsonBody(res)) as ApiSuccess<unknown> | ApiError;
  if (!res.ok || !json.success) {
    const msg = !json.success ? json.error.message : `HTTP ${res.status}`;
    const code = !json.success ? json.error.code : res.status === 413 ? 'FILE_TOO_LARGE' : 'REQUEST_FAILED';
    throw new Error(`${code}: ${msg}`);
  }
}

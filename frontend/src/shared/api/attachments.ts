import { getAccessToken } from '../lib/auth-storage';
import { apiUrl, authenticatedFetch, parseJsonBody, type ApiError, type ApiSuccess } from './http';

/** Картинка сообщения. Пути подписаны сервером и живут ~сутки, перед показом — `attachmentSrc`. */
export type AttachmentDto = {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Файл удалён очисткой хранилища — показывать заглушку. */
  purged: boolean;
  url: string | null;
  thumb_url: string | null;
};

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** GIF и прочее сервер не принимает; проверка здесь — только чтобы не грузить заведомо отклонённое. */
export const ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/webp';
const ACCEPTED_TYPES = new Set(ATTACHMENT_ACCEPT.split(','));

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED_TYPES.has(file.type);
}

export function attachmentSrc(path: string | null): string | null {
  return path ? apiUrl(path) : null;
}

export class UploadError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** Загрузка через XHR — ради прогресса (у fetch его нет). */
export function uploadAttachment(
  channelId: number,
  file: File,
  onProgress: (fraction: number) => void,
): { promise: Promise<AttachmentDto>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  let aborted = false;
  const promise = (async () => {
    const { ensureAccessTokenFresh } = await import('./token-refresh.js');
    await ensureAccessTokenFresh();
    const token = getAccessToken();
    if (aborted) {
      throw new UploadError('ABORTED');
    }
    if (!token) {
      throw new UploadError('UNAUTHORIZED');
    }
    const body = new FormData();
    body.append('file', file, file.name || 'image.png');
    return new Promise<AttachmentDto>((resolve, reject) => {
      xhr.open('POST', apiUrl(`/api/v1/channels/${channelId}/attachments`));
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded / event.total);
        }
      };
      xhr.onload = () => {
        let json: ApiSuccess<AttachmentDto> | ApiError | null = null;
        try {
          json = JSON.parse(xhr.responseText) as ApiSuccess<AttachmentDto> | ApiError;
        } catch {
          /* nginx 413 и прочие не-JSON ответы */
        }
        if (xhr.status >= 200 && xhr.status < 300 && json?.success) {
          resolve(json.data);
          return;
        }
        const code = json && !json.success ? json.error.code : xhr.status === 413 ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED';
        reject(new UploadError(code));
      };
      xhr.onerror = () => reject(new UploadError('UPLOAD_FAILED'));
      xhr.onabort = () => reject(new UploadError('ABORTED'));
      xhr.send(body);
    });
  })();
  return {
    promise,
    abort: () => {
      aborted = true;
      xhr.abort();
    },
  };
}

/** Убрать неотправленную картинку с сервера (крестик в лотке). Ошибки не важны: сервер сам чистит через час. */
export async function discardAttachment(id: string): Promise<void> {
  try {
    const res = await authenticatedFetch(apiUrl(`/api/v1/attachments/${id}`), { method: 'DELETE' });
    await parseJsonBody(res);
  } catch {
    /* ignore */
  }
}

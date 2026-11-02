import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { processServerIcon } from '../attachments/image-pipeline.js';
import { publishServerSettings } from '../server-settings/server-settings.service.js';
import {
  newServerIconKey,
  removeServerIconFile,
  removeServerIconFilesExcept,
  serverIconUrl,
  writeServerIconFile,
} from './server-icon-storage.js';

/**
 * Смена аватара — по одной за раз (процесс один): запись файла → коммит в БД → удаление остальных файлов.
 * Без очереди параллельная загрузка могла бы стереть файл, на который уже указывает БД.
 */
let chain: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/** Прежний файл уже не нужен; если удалить не вышло, его подчистит следующая смена. */
async function cleanupExcept(key: string | null): Promise<void> {
  await removeServerIconFilesExcept(key).catch(() => undefined);
}

/**
 * Новый аватар. `actor: 'setup'` — загрузка на первичной настройке: владельца ещё нет,
 * поэтому без журнала и только пока сервер не настроен.
 */
export async function setServerIcon(
  file: Buffer,
  actor: { actorId: number } | 'setup',
): Promise<{ server_icon_url: string | null }> {
  const data = await processServerIcon(file);
  const key = newServerIconKey();
  await serialized(async () => {
    await writeServerIconFile(key, data);
    try {
      await prisma.$transaction(async (tx) => {
        const row = await tx.serverSettings.findUnique({ where: { id: 1 }, select: { isBootstrapped: true } });
        if (!row) {
          throw new AppError('SERVER_MISCONFIGURED', 500, 'ServerSettings row missing; run pnpm prisma:seed');
        }
        if (actor === 'setup' && row.isBootstrapped) {
          throw new AppError('SERVER_ALREADY_BOOTSTRAPPED', 409, 'Server is already bootstrapped');
        }
        await tx.serverSettings.update({ where: { id: 1 }, data: { iconKey: key } });
        if (actor !== 'setup') {
          await tx.moderationLog.create({ data: { actorId: actor.actorId, action: 'SERVER_ICON_UPDATE' } });
        }
      });
    } catch (error) {
      await removeServerIconFile(key).catch(() => undefined);
      throw error;
    }
    await cleanupExcept(key);
  });
  await publishServerSettings();
  return { server_icon_url: serverIconUrl(key) };
}

export async function removeServerIcon(actorId: number): Promise<{ server_icon_url: string | null }> {
  const removed = await serialized(async () => {
    const changed = await prisma.$transaction(async (tx) => {
      const row = await tx.serverSettings.findUnique({ where: { id: 1 }, select: { iconKey: true } });
      if (!row?.iconKey) {
        return false;
      }
      await tx.serverSettings.update({ where: { id: 1 }, data: { iconKey: null } });
      await tx.moderationLog.create({ data: { actorId, action: 'SERVER_ICON_REMOVE' } });
      return true;
    });
    await cleanupExcept(null);
    return changed;
  });
  if (removed) {
    await publishServerSettings();
  }
  return { server_icon_url: null };
}

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storageConfig } from '../attachments/attachment-storage.js';

/** Файлы смайликов лежат рядом с картинками чата: <UPLOADS_DIR>/emoji/<id>.webp. Имя — только серверный id. */
function emojiPath(id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Invalid emoji id');
  }
  return path.join(storageConfig().dir, 'emoji', `${id}.webp`);
}

export async function writeEmojiFile(id: number, data: Buffer): Promise<void> {
  const target = emojiPath(id);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, data, { mode: 0o644 });
  await rename(tmp, target);
}

export async function readEmojiFile(id: number): Promise<Buffer | null> {
  try {
    return await readFile(emojiPath(id));
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function removeEmojiFile(id: number): Promise<void> {
  await rm(emojiPath(id), { force: true });
}

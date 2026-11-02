import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { censorContent, compileWordMatcher, containsBannedWord, type WordMatcher } from './word-filter.js';

/** Процесс один — держим скомпилированный список в памяти и сбрасываем при сохранении. */
let cachedMatcher: Promise<WordMatcher> | null = null;

async function loadBannedWords(): Promise<string[]> {
  const row = await prisma.serverSettings.findUnique({ where: { id: 1 }, select: { bannedWords: true } });
  if (!row) {
    throw new AppError('SERVER_MISCONFIGURED', 500, 'ServerSettings row missing; run pnpm prisma:seed');
  }
  return row.bannedWords;
}

function wordMatcher(): Promise<WordMatcher> {
  if (!cachedMatcher) {
    const loading = loadBannedWords().then(compileWordMatcher);
    cachedMatcher = loading;
    loading.catch(() => {
      if (cachedMatcher === loading) {
        cachedMatcher = null;
      }
    });
  }
  return cachedMatcher;
}

export function resetWordFilterCache(): void {
  cachedMatcher = null;
}

export async function censorMessageContent(content: string): Promise<string> {
  return censorContent(content, await wordMatcher());
}

export async function hasBannedWords(text: string): Promise<boolean> {
  return containsBannedWord(text, await wordMatcher());
}

export async function getBannedWords(): Promise<{ words: string[] }> {
  return { words: await loadBannedWords() };
}

export async function setBannedWords(words: string[]): Promise<{ words: string[] }> {
  const row = await prisma.serverSettings.update({
    where: { id: 1 },
    data: { bannedWords: words },
    select: { bannedWords: true },
  });
  resetWordFilterCache();
  return { words: row.bannedWords };
}

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeGameCatalog, type GameCatalogEntry } from './normalize-catalog.js';

const CATALOG_PATH = join(process.cwd(), 'assets', 'windows-game-processes.json');

type Cache = {
  mtimeMs: number;
  games: GameCatalogEntry[];
};

let cache: Cache | null = null;

export function gameCatalogPath(): string {
  return CATALOG_PATH;
}

/** Читает файл заново, только если mtime изменился. */
export async function loadGameCatalog(): Promise<GameCatalogEntry[]> {
  const info = await stat(CATALOG_PATH);
  if (cache && cache.mtimeMs === info.mtimeMs) {
    return cache.games;
  }
  const text = await readFile(CATALOG_PATH, 'utf8');
  const games = normalizeGameCatalog(JSON.parse(text) as unknown);
  cache = { mtimeMs: info.mtimeMs, games };
  return games;
}

export type GameCatalogEntry = {
  exe: string;
  title: string;
};

/** Плоский список `exe → title`. Что считать игрой, решает сам файл каталога: лаунчеров и пометок в нём нет. */
export function normalizeGameCatalog(raw: unknown): GameCatalogEntry[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const processes = (raw as { processes?: unknown }).processes;
  if (!processes || typeof processes !== 'object') {
    return [];
  }
  const games: GameCatalogEntry[] = [];
  for (const [exe, entry] of Object.entries(processes)) {
    const cleanExe = exe.trim();
    const title =
      entry && typeof entry === 'object' && typeof (entry as { title?: unknown }).title === 'string'
        ? (entry as { title: string }).title.trim()
        : '';
    if (cleanExe && title) {
      games.push({ exe: cleanExe, title });
    }
  }
  return games;
}

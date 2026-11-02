export type GameCatalogEntry = {
  exe: string;
  title: string;
};

const SKIP_SNIPPETS = [
  'do not',
  'ambiguous',
  'not a reliable',
  'not the match',
  'not ideal for detection',
];

const NOTE_INSIDE =
  /verify|possible|variant|varies|diagnostic|anti-cheat|legacy|commonly|alternate|tmodloader|not in primary|modded|capitalization|localized|classic|unreal/i;

export function shouldSkipGameProcess(title: string): boolean {
  const lower = title.toLowerCase();
  if (SKIP_SNIPPETS.some((snippet) => lower.includes(snippet))) {
    return true;
  }
  return /\blauncher\b/i.test(title);
}

/** Убирает редакционные пометки в хвостовых скобках. `DOOM (2016)` остаётся. */
export function displayGameTitle(title: string): string {
  let current = title.trim();
  for (let i = 0; i < 3; i += 1) {
    const match = current.match(/\s*\(([^)]*)\)\s*$/);
    const note = match?.[1];
    if (!match || note === undefined || !NOTE_INSIDE.test(note)) {
      break;
    }
    current = current.slice(0, match.index).trim();
  }
  return current;
}

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
    if (!cleanExe) {
      continue;
    }
    const title =
      entry && typeof entry === 'object' && typeof (entry as { title?: unknown }).title === 'string'
        ? (entry as { title: string }).title
        : '';
    if (shouldSkipGameProcess(title)) {
      continue;
    }
    const display = displayGameTitle(title);
    if (!display) {
      continue;
    }
    games.push({ exe: cleanExe, title: display });
  }
  return games;
}

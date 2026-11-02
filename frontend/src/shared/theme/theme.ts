export type ThemeName = 'dark' | 'light';

const listeners = new Set<(theme: ThemeName) => void>();

/**
 * Дизайн-система Hooba пока только тёмная (план миграции, R1): любая сохранённая светлая тема игнорируется,
 * `applyTheme` всегда включает тёмную. API оставлен, пока на него ссылаются `ThemeSlider` / `ThemeToggle`
 * (удаляются при переводе настроек, этап 4.2 / 5).
 */
export function readTheme(): ThemeName {
  return 'dark';
}

export function applyTheme(): void {
  const root = document.documentElement;
  root.dataset.theme = 'dark';
  root.classList.add('dark-mode');
}

export function setTheme(theme: ThemeName): void {
  applyTheme();
  for (const listener of listeners) {
    listener('dark');
  }
  void theme;
}

export function subscribeTheme(listener: (theme: ThemeName) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Копия правил backend `modules/users/display-name.ts`: сервер проверяет то же самое — меняйте вместе.

/** Длина в символах (code points). Длиннее — не влезает в строки списков и чата. */
export const DISPLAY_NAME_MAX_LENGTH = 26;

/**
 * Буквы любых алфавитов, цифры, пробел и `_ . - '`. Без эмодзи, символов-рамок,
 * управляющих и bidi-символов, комбинируемых знаков (Zalgo) — всё это ломает вёрстку.
 */
const ALLOWED = /^[\p{L}\p{Nd} _.'-]+$/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;
/** Формально буквы, но рисуются пустым местом. */
const INVISIBLE_LETTERS = /[ᅟᅠㅤﾠ]/u;

export type DisplayNameError = 'too_long' | 'invalid_chars' | 'no_letters';

export type DisplayNameResult = { ok: true; value: string | null } | { ok: false; error: DisplayNameError };

/**
 * NFKC сводит «стилизованные» буквы (𝓗𝓸𝓸𝓫𝓪, полноширинные) к обычным, пробелы схлопываются.
 * Пустая строка или null — сбросить имя (показывать username).
 */
export function normalizeDisplayName(raw: string | null): DisplayNameResult {
  if (raw === null) {
    return { ok: true, value: null };
  }
  const value = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!value) {
    return { ok: true, value: null };
  }
  if ([...value].length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, error: 'too_long' };
  }
  if (!ALLOWED.test(value) || INVISIBLE_LETTERS.test(value)) {
    return { ok: false, error: 'invalid_chars' };
  }
  if (!HAS_LETTER_OR_DIGIT.test(value)) {
    return { ok: false, error: 'no_letters' };
  }
  return { ok: true, value };
}

export const DISPLAY_NAME_ERROR_TEXT: Record<DisplayNameError, string> = {
  too_long: `Не длиннее ${DISPLAY_NAME_MAX_LENGTH} символов`,
  invalid_chars: "Только буквы, цифры, пробел и символы _ . - '",
  no_letters: "Нужна хотя бы одна буква или цифра",
};

/** Имя для показа: отображаемое, если задано, иначе username. */
export function displayNameOf(user: { username: string; display_name?: string | null }): string {
  return user.display_name || user.username;
}

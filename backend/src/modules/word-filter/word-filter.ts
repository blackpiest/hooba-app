/**
 * Фильтр запрещённых слов в сообщениях чата.
 *
 * Шаблон — одно слово из букв/цифр, `*` допускается только по краям:
 * `дурак` — целое слово, `дурак*` — слово начинается с, `*дурак` — заканчивается на,
 * `*дурак*` — содержит. Сравнение без учёта регистра, `ё` = `е`.
 *
 * Текст режется на слова (максимальные серии букв/цифр), совпавшее слово целиком
 * заменяется звёздочками той же длины. Замена однопроходная, а `*` не буква —
 * маска не может совпасть повторно, циклов нет.
 */

export const BANNED_WORDS_MAX = 500;
export const BANNED_WORD_MAX_LENGTH = 64;

const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const PATTERN = /^\*?[\p{L}\p{M}\p{N}]+\*?$/u;

export interface WordMatcher {
  exact: Set<string>;
  prefix: string[];
  suffix: string[];
  contains: string[];
}

function fold(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е');
}

/** Приводит шаблон к хранимому виду или возвращает null, если он некорректен. */
export function normalizeBannedPattern(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > BANNED_WORD_MAX_LENGTH) {
    return null;
  }
  return PATTERN.test(value) ? value : null;
}

export function compileWordMatcher(patterns: readonly string[]): WordMatcher {
  const matcher: WordMatcher = { exact: new Set(), prefix: [], suffix: [], contains: [] };
  for (const raw of patterns) {
    const pattern = normalizeBannedPattern(raw);
    if (!pattern) {
      continue;
    }
    const starts = pattern.startsWith('*');
    const ends = pattern.endsWith('*');
    const core = fold(pattern.slice(starts ? 1 : 0, ends ? -1 : undefined));
    if (starts && ends) {
      matcher.contains.push(core);
    } else if (ends) {
      matcher.prefix.push(core);
    } else if (starts) {
      matcher.suffix.push(core);
    } else {
      matcher.exact.add(core);
    }
  }
  return matcher;
}

export function isEmptyMatcher(matcher: WordMatcher): boolean {
  return (
    matcher.exact.size === 0 &&
    matcher.prefix.length === 0 &&
    matcher.suffix.length === 0 &&
    matcher.contains.length === 0
  );
}

function isBanned(word: string, matcher: WordMatcher): boolean {
  const folded = fold(word);
  return (
    matcher.exact.has(folded) ||
    matcher.prefix.some((core) => folded.startsWith(core)) ||
    matcher.suffix.some((core) => folded.endsWith(core)) ||
    matcher.contains.some((core) => folded.includes(core))
  );
}

/** Есть ли в тексте хоть одно запрещённое слово — для полей, которые не маскируем, а отклоняем. */
export function containsBannedWord(text: string, matcher: WordMatcher): boolean {
  if (isEmptyMatcher(matcher)) {
    return false;
  }
  return Array.from(text.matchAll(WORD)).some(([word]) => isBanned(word, matcher));
}

export function censorContent(text: string, matcher: WordMatcher): string {
  if (isEmptyMatcher(matcher)) {
    return text;
  }
  return text.replace(WORD, (word) => (isBanned(word, matcher) ? '*'.repeat(Array.from(word).length) : word));
}

import { AppError } from '../errors/app-error.js';

/** Верхняя граница PostgreSQL `integer`. Больший id Prisma отвергает ошибкой, а не пустым результатом. */
export const MAX_DB_ID = 2_147_483_647;

/** Целое в диапазоне 1..MAX_DB_ID или null. `1.5`, `1e3`, `-1`, `' '` не проходят. */
export function readDbId(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^\d{1,10}$/.test(value)) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > MAX_DB_ID) return null;
  return id;
}

/** id из параметра пути. Иначе 400 с сообщением `Invalid <what> id`. */
export function parseIdParam(params: unknown, what: string, key = 'id'): number {
  const raw = params && typeof params === 'object' ? (params as Record<string, unknown>)[key] : undefined;
  const id = readDbId(raw);
  if (id === null) {
    throw new AppError('VALIDATION_ERROR', 400, `Invalid ${what} id`);
  }
  return id;
}

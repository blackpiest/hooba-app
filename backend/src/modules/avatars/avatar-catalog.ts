import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { applyCosmeticTexts, loadCosmeticTexts, type CosmeticEdits } from '../cosmetics/cosmetic-texts.js';

const AVATARS_DIR = join(process.cwd(), 'assets', 'avatars');
const CATALOG_PATH = join(AVATARS_DIR, 'catalog.json');

/** Только плоское имя webp: файл из манифеста не может указать за пределы папки. */
const fileNameSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}\.webp$/);
const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/);
/**
 * Виден ли предмет в конструкторе профиля тем, у кого его нет. false — «в запасе»: он есть в базе (иконка титула,
 * награда испытания, ручная выдача), но в конструкторе появляется только у получивших. Владелец меняет поверх каталога.
 */
const listedSchema = z.boolean().default(true);
/**
 * Idle-спрайт: лента из `frames` квадратных кадров в одну строку.
 * `sequence` — порядок показа (индексы кадров), по умолчанию 0..frames-1; длительность кадра 1/fps.
 */
const idleSchema = z
  .object({
    file: fileNameSchema,
    frames: z.number().int().min(2).max(16),
    fps: z.number().int().min(1).max(24),
    sequence: z.array(z.number().int().min(0)).min(2).max(120).optional(),
  })
  .refine((idle) => (idle.sequence ?? []).every((i) => i < idle.frames), { message: 'sequence index out of range' });
/**
 * Персонаж: имя для подсказки в конструкторе (нет — показывается id), полный рост для карточки профиля,
 * кроп головы для маленьких аватаров и необязательный idle-спрайт.
 */
const characterSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(40).optional(),
  file: fileNameSchema,
  head: fileNameSchema,
  idle: idleSchema.optional(),
  listed: listedSchema,
});
/*
 * Фоны и рамки описываются данными, клиент только рисует их по спеке. Всё, что попадает в style на клиенте,
 * проверяется здесь: цвета — только hex, числа ограничены, произвольных CSS-строк нет.
 */
const colorSchema = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
const alphaSchema = z.number().min(0).max(1);
const labelSchema = z.string().trim().min(1).max(40);
/** Секунды анимации. */
const durationSchema = z.number().min(0.3).max(20);

/** Цвета рамки: грань, обводка окна, кромка таблички, внутренняя кайма с прозрачностью. */
const frameColorsSchema = z.object({
  frame: colorSchema,
  line: colorSchema,
  plateEdge: colorSchema,
  inner: colorSchema,
  innerAlpha: alphaSchema,
});
/** Мерцающее свечение вокруг рамки: тень пульсирует между A и B за `period` секунд. */
const frameGlowSchema = z.object({
  colorA: colorSchema,
  alphaA: alphaSchema,
  colorB: colorSchema,
  alphaB: alphaSchema,
  blurMin: z.number().min(0).max(32),
  blurMax: z.number().min(0).max(32),
  period: durationSchema,
});
/** Искра: старт x/y в % слоя декора, снос наружу dx и размер в px, задержка и длительность в секундах. */
const sparkSchema = z.object({
  x: z.number().min(-5).max(105),
  y: z.number().min(-5).max(105),
  dx: z.number().min(-16).max(16),
  delay: z.number().min(0).max(20),
  dur: durationSchema,
  size: z.number().int().min(1).max(12),
  color: colorSchema,
  glow: colorSchema,
});
/**
 * Искры вокруг рамки. Генераторные поля frame-lab (seed, palette, zones…) отбрасываются: нужна только раскладка.
 * `rise` < 0 — искры падают вниз; `shape: flake` — пиксельная снежинка вместо квадрата.
 */
const frameSparksSchema = z.object({
  rise: z.number().min(-80).max(80),
  shape: z.enum(['square', 'flake']).default('square'),
  endScale: z.number().min(0).max(2),
  glowBlur: z.number().min(0).max(24),
  outline: colorSchema.nullish().transform((v) => v ?? null),
  items: z.array(sparkSchema).min(1).max(60),
});
/**
 * Выступ за край рамки (льдинка, сосулька): пиксельные столбики наружу от стороны `side`, центр — в `at` % её длины.
 * `steps` — высоты столбиков в px, ширина столбика `px`; цвет — `color` или цвет рамки.
 */
const frameEdgeSchema = z.object({
  side: z.enum(['top', 'bottom', 'left', 'right']),
  at: z.number().min(0).max(100),
  steps: z.array(z.number().int().min(0).max(12)).min(1).max(24),
  px: z.number().int().min(1).max(4).default(2),
  color: colorSchema.optional(),
});
/**
 * Рамка (формат frame-lab `hooba-frame@1`, JSON вставляется как есть). Доступна всем, пока не стала
 * наградой испытания или не убрана «в запас» (`cosmetics/cosmetic-access.ts`); старое поле `unlock` игнорируется.
 */
const frameSchema = z.object({
  id: idSchema,
  label: labelSchema,
  colors: frameColorsSchema,
  glow: frameGlowSchema.nullish().transform((v) => v ?? null),
  sparks: frameSparksSchema.nullish().transform((v) => v ?? null),
  edges: z.array(frameEdgeSchema).max(32).default([]),
  listed: listedSchema,
});

/** Движение слоя фона: `scroll` — по диагонали, `drift` — влево; `blink` — слой мигает. */
const layerMotionSchema = z.enum(['scroll', 'drift', 'none']);
const layerCommon = {
  /** Сторона тайла в px. */
  size: z.number().int().min(8).max(128).default(40),
  motion: layerMotionSchema.default('none'),
  blink: z.boolean().default(false),
};
/** Тайл из пиксельного битмапа: «#» — закрашенный пиксель, мотив рисуется в каждой точке `offsets`. */
const bitmapLayerSchema = z
  .object({
    bitmap: z.array(z.string().regex(/^[.#]{1,32}$/)).min(1).max(32),
    color: colorSchema,
    px: z.number().int().min(1).max(8).default(2),
    offsets: z
      .array(z.tuple([z.number().int().min(0).max(128), z.number().int().min(0).max(128)]))
      .min(1)
      .max(8)
      .default([
        [4, 4],
        [24, 24],
      ]),
    ...layerCommon,
  })
  .refine((layer) => layer.bitmap.every((row) => row.length === layer.bitmap[0]?.length), {
    message: 'bitmap rows must have equal length',
  });
/** Тайл-картинка из папки каталога. */
const fileLayerSchema = z.object({ file: fileNameSchema, ...layerCommon });
const backgroundLayerSchema = z.union([bitmapLayerSchema, fileLayerSchema]);
/** Подложка под тайлами: цвет или радиальный градиент. Нет — цвет бренда. */
const backgroundBaseSchema = z.union([
  z.object({ color: colorSchema }),
  z.object({ gradient: z.object({ from: colorSchema, to: colorSchema }) }),
]);
/** Фон окна карточки: подложка и 1–3 слоя тайлов снизу вверх. */
const backgroundSchema = z.object({
  id: idSchema,
  label: labelSchema,
  base: backgroundBaseSchema.optional(),
  layers: z.array(backgroundLayerSchema).min(1).max(3),
  listed: listedSchema,
});

/**
 * Пиксельная иконка прямо в манифесте: каждый символ строки — ключ палитры, «.» — прозрачный пиксель.
 * Клиент рисует её сеткой квадратов, поэтому для простых значков webp не нужен.
 */
const pixelIconSchema = z
  .object({
    palette: z.record(z.string().regex(/^[a-zA-Z0-9]$/), colorSchema),
    pixels: z.array(z.string().regex(/^[.a-zA-Z0-9]{1,32}$/)).min(1).max(32),
  })
  .refine((icon) => icon.pixels.every((row) => row.length === icon.pixels[0]?.length), {
    message: 'pixels rows must have equal length',
  })
  .refine((icon) => icon.pixels.every((row) => [...row].every((ch) => ch === '.' || ch in icon.palette)), {
    message: 'pixels use a key missing from palette',
  });
const badgeIconSchema = z.union([z.object({ file: fileNameSchema }), pixelIconSchema]);
/** Категория значка. `role` — выдаётся только ролью (`Role.badgeId`), вручную не выдаётся. */
const badgeCategorySchema = z.enum(['role', 'achievement', 'event', 'reward']);
/** Значок: `description` — за что выдан, `hint` — как получить (видно на замке в конструкторе). */
const badgeSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(32),
  category: badgeCategorySchema,
  description: z.string().trim().min(1).max(160),
  hint: z.string().trim().min(1).max(120).optional(),
  icon: badgeIconSchema,
  listed: listedSchema,
});
/** Титул под именем на карточке; `badge` — id значка, чья иконка рисуется рядом. */
const titleSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(32),
  badge: idSchema.optional(),
  listed: listedSchema,
});

const catalogSchema = z.object({
  characters: z.array(characterSchema).min(1),
  backgrounds: z.array(backgroundSchema),
  frames: z.array(frameSchema),
  badges: z.array(badgeSchema).max(200).default([]),
  titles: z.array(titleSchema).max(200).default([]),
});

export type AvatarCharacter = z.infer<typeof characterSchema>;
export type AvatarFrame = z.infer<typeof frameSchema>;
export type AvatarBackground = z.infer<typeof backgroundSchema>;
export type AvatarBackgroundLayer = z.infer<typeof backgroundLayerSchema>;
export type AvatarBadge = z.infer<typeof badgeSchema>;
export type AvatarBadgeCategory = z.infer<typeof badgeCategorySchema>;
export type AvatarTitle = z.infer<typeof titleSchema>;

export type AvatarCatalog = {
  version: string;
  characters: AvatarCharacter[];
  backgrounds: AvatarBackground[];
  frames: AvatarFrame[];
  badges: AvatarBadge[];
  titles: AvatarTitle[];
};

/** Косметика профиля. null в поле — «нет» (персонаж → буква, фон → цвет бренда, рамка → базовая). */
export type UserAvatar = { character: string | null; background: string | null; frame: string | null };

/** Проверяет манифест: формат, уникальность id и файлов. */
export function normalizeAvatarCatalog(raw: unknown, version: string): AvatarCatalog {
  const parsed = catalogSchema.parse(raw);
  for (const list of [parsed.characters, parsed.backgrounds, parsed.frames, parsed.badges, parsed.titles]) {
    if (new Set(list.map((item) => item.id)).size !== list.length) {
      throw new Error('avatar catalog: duplicate id');
    }
  }
  // Один файл слоя может повторяться в разных фонах, но не пересекаться с файлами персонажей и значков.
  const files = [...parsed.characters.flatMap(characterFiles), ...parsed.badges.flatMap(badgeFiles)];
  if (new Set(files).size !== files.length || parsed.backgrounds.flatMap(backgroundFiles).some((f) => files.includes(f))) {
    throw new Error('avatar catalog: duplicate file');
  }
  const badgeIds = new Set(parsed.badges.map((item) => item.id));
  if (parsed.titles.some((title) => title.badge !== undefined && !badgeIds.has(title.badge))) {
    throw new Error('avatar catalog: title references unknown badge');
  }
  return { version, ...parsed };
}

function badgeFiles(item: AvatarBadge): string[] {
  return 'file' in item.icon ? [item.icon.file] : [];
}

function characterFiles(item: AvatarCharacter): string[] {
  return item.idle ? [item.file, item.head, item.idle.file] : [item.file, item.head];
}

function backgroundFiles(item: AvatarBackground): string[] {
  return item.layers.flatMap((layer) => ('file' in layer ? [layer.file] : []));
}

/** Все три поля null — то же, что «аватар не выбран». */
export function normalizeUserAvatar(avatar: UserAvatar | null): UserAvatar | null {
  if (!avatar || (avatar.character === null && avatar.background === null && avatar.frame === null)) {
    return null;
  }
  return avatar;
}

export function isValidAvatar(catalog: AvatarCatalog, avatar: UserAvatar): boolean {
  const known = (list: { id: string }[], id: string | null) => id === null || list.some((item) => item.id === id);
  return (
    known(catalog.characters, avatar.character) &&
    known(catalog.backgrounds, avatar.background) &&
    known(catalog.frames, avatar.frame)
  );
}

/** Файл отдаётся, только если он перечислен в манифесте. */
export function isCatalogFile(catalog: AvatarCatalog, file: string): boolean {
  return (
    catalog.characters.some((item) => characterFiles(item).includes(file)) ||
    catalog.backgrounds.some((item) => backgroundFiles(item).includes(file)) ||
    catalog.badges.some((item) => badgeFiles(item).includes(file))
  );
}

export function avatarFilePath(file: string): string {
  return join(AVATARS_DIR, file);
}

/** Поля из БД; все null — аватар не выбран. */
export function toUserAvatar(row: {
  avatarCharacter: string | null;
  avatarBackground: string | null;
  avatarFrame: string | null;
}): UserAvatar | null {
  return normalizeUserAvatar({
    character: row.avatarCharacter,
    background: row.avatarBackground,
    frame: row.avatarFrame,
  });
}

let cache: { mtimeMs: number; catalog: AvatarCatalog } | null = null;

/**
 * Каталог как в файле, без правок владельца. Читает манифест заново, только если mtime изменился.
 * Нужен админке (значения «как в каталоге») и тестам без БД; остальным — `loadAvatarCatalog`.
 */
export async function loadCatalogFile(): Promise<AvatarCatalog> {
  const info = await stat(CATALOG_PATH);
  if (cache && cache.mtimeMs === info.mtimeMs) {
    return cache.catalog;
  }
  const text = await readFile(CATALOG_PATH, 'utf8');
  const catalog = normalizeAvatarCatalog(JSON.parse(text) as unknown, Math.trunc(info.mtimeMs).toString(36));
  cache = { mtimeMs: info.mtimeMs, catalog };
  return catalog;
}

let merged: { file: AvatarCatalog; texts: CosmeticEdits; catalog: AvatarCatalog } | null = null;

/**
 * Каталог с правками владельца (тексты значков и титулов, свои и скрытые титулы — `cosmetics/cosmetic-texts.ts`).
 * Его используют все: API каталога, выдача, витрина, испытания. Пересобирается, только если сменился файл или правки.
 */
export async function loadAvatarCatalog(): Promise<AvatarCatalog> {
  const [file, texts] = await Promise.all([loadCatalogFile(), loadCosmeticTexts()]);
  if (!merged || merged.file !== file || merged.texts !== texts) {
    merged = { file, texts, catalog: applyCosmeticTexts(file, texts.rows, texts.customTitles) };
  }
  return merged.catalog;
}

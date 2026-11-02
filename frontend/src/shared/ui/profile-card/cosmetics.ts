/*
 * Фоны и рамки описываются данными в каталоге сервера (`backend/assets/avatars/catalog.json`), клиент только рисует
 * их по спеке: новая косметика не требует обновления клиента. Цвета — только hex, числа ограничены (проверка на сервере).
 */

/** Цвета рамки: грань, обводка окна, кромка таблички, внутренняя кайма с прозрачностью. */
export type FrameColorsSpec = { frame: string; line: string; plateEdge: string; inner: string; innerAlpha: number };

/** Мерцающее свечение вокруг рамки: тень пульсирует между A и B за `period` секунд. */
export type FrameGlowSpec = {
  colorA: string;
  alphaA: number;
  colorB: string;
  alphaB: number;
  blurMin: number;
  blurMax: number;
  period: number;
};

/** Искра: старт x/y в % слоя декора, снос наружу dx и размер в px, задержка и длительность в секундах. */
export type FrameSparkSpec = {
  x: number;
  y: number;
  dx: number;
  delay: number;
  dur: number;
  size: number;
  color: string;
  glow: string;
};

/**
 * Искры вокруг рамки: подъём в px (меньше нуля — падают), форма (квадрат или снежинка),
 * масштаб в конце полёта, размытие свечения, контур.
 */
export type FrameSparksSpec = {
  rise: number;
  shape: "square" | "flake";
  endScale: number;
  glowBlur: number;
  outline: string | null;
  items: FrameSparkSpec[];
};

/**
 * Выступ за край рамки (льдинка, сосулька): пиксельные столбики наружу от стороны `side`, центр — в `at` % её длины;
 * `steps` — высоты столбиков в px, ширина столбика `px`. Нет `color` — цвет рамки.
 */
export type FrameEdgeSpec = {
  side: "top" | "bottom" | "left" | "right";
  at: number;
  steps: number[];
  px: number;
  color?: string;
};

/** Скин рамки мини-профиля (формат frame-lab `hooba-frame@1`). null вместо спеки — базовая рамка. */
export type FrameSpec = {
  id: string;
  label: string;
  colors: FrameColorsSpec;
  glow: FrameGlowSpec | null;
  sparks: FrameSparksSpec | null;
  edges: FrameEdgeSpec[];
};

/** Слой фона: тайл со стороной `size` px; `scroll` — едет по диагонали, `drift` — влево; `blink` — мигает. */
type BackgroundLayerCommon = { size: number; motion: "scroll" | "drift" | "none"; blink: boolean };

/** Тайл из пиксельного битмапа («#» — закрашенный пиксель), мотив рисуется в каждой точке `offsets`. */
export type BackgroundBitmapLayerSpec = BackgroundLayerCommon & {
  bitmap: string[];
  color: string;
  px: number;
  offsets: [number, number][];
};

/** Тайл-картинка с сервера. */
export type BackgroundImageLayerSpec = BackgroundLayerCommon & { url: string };

export type BackgroundLayerSpec = BackgroundBitmapLayerSpec | BackgroundImageLayerSpec;

/** Подложка под тайлами: цвет или радиальный градиент. null — цвет бренда. */
export type BackgroundBaseSpec = { color: string } | { gradient: { from: string; to: string } };

/** Фон окна карточки: подложка и слои тайлов снизу вверх. */
export type BackgroundSpec = {
  id: string;
  label: string;
  base: BackgroundBaseSpec | null;
  layers: BackgroundLayerSpec[];
};

/** Idle-спрайт: лента из `frames` квадратных кадров; `sequence` — порядок показа, кадр длится 1/fps. */
export type CharacterIdleSpec = { url: string; frames: number; fps: number; sequence: number[] };

/** Слой-картинка внутри окна карточки (персонаж). `idle` — спрайт вместо покачивания статичной картинки. */
export type CosmeticLayerSpec = { kind: "image"; url: string; idle?: CharacterIdleSpec | null };

/** Всё, что нужно карточке, чтобы нарисовать косметику пользователя. null — слоя нет (рамка — базовая). */
export type ProfileCosmetics = {
  frame: FrameSpec | null;
  background: BackgroundSpec | null;
  character: CosmeticLayerSpec | null;
};

/** Иконка значка: файл из каталога или пиксели с палитрой («.» — прозрачный пиксель). */
export type BadgeIconSpec = { url: string } | { palette: Record<string, string>; pixels: string[] };

/** Категория значка. `role` — значок выдаётся ролью, вручную не выдаётся. */
export type BadgeCategory = "role" | "achievement" | "event" | "reward";

/** Значок из каталога: `description` — за что, `hint` — как получить (видно на замке). */
export type BadgeSpec = {
  id: string;
  name: string;
  category: BadgeCategory;
  description: string;
  hint: string | null;
  icon: BadgeIconSpec;
};

/** Титул под именем на карточке; `badge` — значок, чья иконка рисуется рядом. */
export type TitleSpec = { id: string; label: string; badge: string | null };

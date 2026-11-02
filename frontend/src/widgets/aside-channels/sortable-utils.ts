import type { Modifier } from "@dnd-kit/core";

/** Перетаскивание каналов только по вертикали. */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

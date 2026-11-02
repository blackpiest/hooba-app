export type ChannelOrderSlot = {
  id: number;
  visible: boolean;
};

/**
 * Видимые слоты заполняются `visibleOrder`. Скрытые каналы остаются между теми же соседями.
 * `null` — это не полная перестановка видимых id.
 */
export function mergeVisibleChannelOrder(
  slots: readonly ChannelOrderSlot[],
  visibleOrder: readonly number[],
): number[] | null {
  const visibleIds = slots.filter((slot) => slot.visible).map((slot) => slot.id);
  if (visibleOrder.length !== visibleIds.length) {
    return null;
  }
  const expected = new Set(visibleIds);
  if (expected.size !== visibleIds.length) {
    return null;
  }
  const seen = new Set<number>();
  for (const id of visibleOrder) {
    if (!expected.has(id) || seen.has(id)) {
      return null;
    }
    seen.add(id);
  }
  const queue = [...visibleOrder];
  return slots.map((slot) => (slot.visible ? (queue.shift() as number) : slot.id));
}

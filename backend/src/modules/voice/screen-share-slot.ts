type ScreenSlot = {
  userId: number;
  videoProducerId: string | null;
  audioProducerId: string | null;
};

const slots = new Map<number, ScreenSlot>();

export function getScreenSlot(channelId: number): ScreenSlot | undefined {
  return slots.get(channelId);
}

export function setScreenSlot(channelId: number, slot: ScreenSlot): void {
  slots.set(channelId, slot);
}

export function deleteScreenSlot(channelId: number): void {
  slots.delete(channelId);
}

/** Синхронный захват слота до await produce. Чужой слот не перезаписывается. */
export function claimScreenShare(channelId: number, userId: number): boolean {
  const existing = slots.get(channelId);
  if (existing && existing.userId !== userId) {
    return false;
  }
  if (!existing) {
    slots.set(channelId, { userId, videoProducerId: null, audioProducerId: null });
  }
  return true;
}

/** Снять захват, если produce не успел записать id. */
export function releaseUnboundScreenClaim(channelId: number, userId: number): void {
  const slot = slots.get(channelId);
  if (!slot || slot.userId !== userId) {
    return;
  }
  if (!slot.videoProducerId && !slot.audioProducerId) {
    slots.delete(channelId);
  }
}

export function clearScreenShareSlots(): void {
  slots.clear();
}

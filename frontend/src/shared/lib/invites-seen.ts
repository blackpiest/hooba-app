const keyOf = (userId: number) => `hooba_invites_seen_${userId}`;

/** Открывал ли участник модалку личных приглашений (индикатор на кнопке горит до первого открытия). */
export function hasSeenInvites(userId: number): boolean {
  try {
    return window.localStorage.getItem(keyOf(userId)) === "1";
  } catch {
    return true;
  }
}

export function markInvitesSeen(userId: number): void {
  try {
    window.localStorage.setItem(keyOf(userId), "1");
  } catch {
    /* хранилище недоступно — индикатор просто останется */
  }
}

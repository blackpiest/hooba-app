export type PresencePreference = 'online' | 'idle' | 'dnd' | 'invisible';
export type PublicPresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type DbPresencePreference = 'ONLINE' | 'IDLE' | 'DND' | 'INVISIBLE';

/** Публичный статус по числу сессий, предпочтению аккаунта и флагу afk. */
export function resolvePublicStatus(
  sessionCount: number,
  preference: PresencePreference,
  allSessionsAfk: boolean,
): PublicPresenceStatus {
  if (sessionCount <= 0) {
    return 'offline';
  }
  switch (preference) {
    case 'invisible':
      return 'offline';
    case 'dnd':
      return 'dnd';
    case 'idle':
      return 'idle';
    case 'online':
      return allSessionsAfk ? 'idle' : 'online';
    default: {
      const exhaustive: never = preference;
      return exhaustive;
    }
  }
}

export function presenceFromDb(value: DbPresencePreference): PresencePreference {
  switch (value) {
    case 'IDLE':
      return 'idle';
    case 'DND':
      return 'dnd';
    case 'INVISIBLE':
      return 'invisible';
    case 'ONLINE':
      return 'online';
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

export function presenceToDb(value: PresencePreference): DbPresencePreference {
  switch (value) {
    case 'idle':
      return 'IDLE';
    case 'dnd':
      return 'DND';
    case 'invisible':
      return 'INVISIBLE';
    case 'online':
      return 'ONLINE';
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

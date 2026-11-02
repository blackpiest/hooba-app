import type { AvatarLook } from '@/shared/ui/avatar';

export type DesktopToastKind = 'message' | 'game';

/** Что главное окно отдаёт в main: тост рисует отдельное окно `/toasts`. */
export type DesktopToastInput = {
  kind: DesktopToastKind;
  title: string;
  body: string;
  meta: string;
  /** Абсолютный URL головы персонажа и спека фона из каталога; null — буквенный. */
  avatar: AvatarLook | null;
  /** Канал, который открыть по клику; null — просто развернуть окно. */
  channelId: number | null;
  /** Своя игра запущена: тост только показывается, мышь проходит в игру. */
  passive: boolean;
};

export type DesktopToast = DesktopToastInput & { id: number };

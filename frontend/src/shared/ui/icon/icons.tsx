import type { ReactNode } from "react";

/**
 * Набор иконок Hooba: сетка 24×24, линия 1.7, квадратные концы (см. витрину дизайн-системы).
 * Заливные иконки помечены fill: currentColor.
 *
 * Соответствие `@untitledui/icons` → name (для миграции экранов):
 *   ArrowDown→arrow-down, ArrowUp→arrow-up, Check→check, ChevronDown/Up/Left/Right→chevron-*,
 *   ChevronSelectorVertical→chevron-updown, Clipboard→clipboard, Copy01→copy, DotsHorizontal→more-h,
 *   DotsVertical→more-v, Edit01/Edit05/PencilLine→edit, Eye→eye, EyeOff→eye-off, Hash02→hash,
 *   Headphones01→headphones, HelpCircle→help, ImageX→image-off, InfoCircle→info, AlertCircle→alert,
 *   LinkExternal01→link-external, LogIn01→login, LogOut01→logout, Menu02→menu, Microphone01→mic,
 *   MicrophoneOff01→mic-off, Minus→minus, PhoneHangUp→phone-off, Plus→plus, RefreshCw01→refresh,
 *   ScissorsCut01→scissors, SearchLg→search, Settings01→settings, Share04→share, Sliders01→sliders,
 *   Trash01→trash, User01→user, VolumeMax→speaker, VolumeX→volume-off, X/XClose/XCloseIcon→close,
 *   BookOpen01→book-open.
 */
export const ICONS = {
  // стрелки и шевроны
  "arrow-up": <path d="M12 20V5m-6 6 6-6 6 6" />,
  "arrow-down": <path d="M12 4v15m-6-6 6 6 6-6" />,
  "arrow-left": <path d="M20 12H5m6-6-6 6 6 6" />,
  "arrow-right": <path d="M4 12h15m-6-6 6 6-6 6" />,
  "chevron-up": <path d="m6 15 6-6 6 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-left": <path d="m15 6-6 6 6 6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "chevron-updown": <path d="m8 9 4-4 4 4m-8 6 4 4 4-4" />,

  // базовые действия
  plus: <path d="M12 4v16M4 12h16" />,
  minus: <path d="M4 12h16" />,
  check: <path d="m4 12 5 5 11-11" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  search: <path d="M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm5 11 5 5" />,
  hash: <path d="M9 3 7 21m10-18-2 18M4 8h17M3 16h17" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  "more-h": <path d="M4 11h3v3H4Zm6.5 0h3v3h-3Zm6.5 0h3v3h-3Z" fill="currentColor" stroke="none" />,
  "more-v": <path d="M11 4h3v3h-3Zm0 6.5h3v3h-3Zm0 6.5h3v3h-3Z" fill="currentColor" stroke="none" />,
  grip: (
    <path d="M8 4h3v3H8Zm5 0h3v3h-3ZM8 10.5h3v3H8Zm5 0h3v3h-3ZM8 17h3v3H8Zm5 0h3v3h-3Z" fill="currentColor" stroke="none" />
  ),
  settings: (
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2" />
  ),
  gear: (
    <>
      <path d="M9.8 4.7 10.1 2.4h3.8l.3 2.3 1.4.6 1.9-1.4 2.6 2.6-1.4 1.9.6 1.4 2.3.3v3.8l-2.3.3-.6 1.4 1.4 1.9-2.6 2.6-1.9-1.4-1.4.6-.3 2.3h-3.8l-.3-2.3-1.4-.6-1.9 1.4-2.6-2.6 1.4-1.9-.6-1.4-2.3-.3v-3.8l2.3-.3.6-1.4-1.4-1.9 2.6-2.6 1.9 1.4Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  sliders: <path d="M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6" />,
  refresh: <path d="M20 11a8 8 0 0 0-14-4L4 9m0-5v5h5M4 13a8 8 0 0 0 14 4l2-2m0 5v-5h-5" />,

  // голос и медиа
  mic: (
    <>
      <rect x="8" y="2" width="8" height="13" rx="4" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8" />
    </>
  ),
  "mic-off": (
    <>
      <rect x="8" y="2" width="8" height="13" rx="4" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8M3 3l18 18" />
    </>
  ),
  speaker: <path d="M4 9v6h4l6 5V4L8 9H4Zm13 0a4 4 0 0 1 0 6m2-9a7 7 0 0 1 0 12" />,
  "volume-off": <path d="M4 9v6h4l6 5V4L8 9H4Zm13 1 5 5m0-5-5 5" />,
  headphones: <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h4v6H4Zm12 0h4v6h-4Z" />,
  "headphones-off": <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h4v6H4Zm12 0h4v6h-4ZM3 3l18 18" />,
  "screen-off": (
    <>
      <rect x="2" y="3" width="20" height="14" rx="1" />
      <path d="M12 17v4m-5 0h10M3 3l18 18" />
    </>
  ),
  screen: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="1" />
      <path d="M12 17v4m-5 0h10m-8-9 3-3 3 3m-3-3v6" />
    </>
  ),
  "phone-off": <path d="M3 14c5-5 13-5 18 0l-2 3-4-2v-3a9 9 0 0 0-6 0v3l-4 2-2-3Z" />,
  play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5v14M16 5v14" />,

  gamepad: (
    <>
      <path d="M6 6h12l4 12-3 2-5-5h-4l-5 5-3-2L6 6Z" />
      <path d="M8 8v6m-3-3h6m5-2v1m3 2v1" />
    </>
  ),

  // правка и текст
  edit: <path d="m4 15 12-12 5 5L9 20l-6 1 1-6Zm9-9 5 5" />,
  send: <path d="m3 4 18 8-18 8 3-8-3-8Zm3 8h8" />,
  bold: <path d="M7 4h6a4 4 0 0 1 0 8H7Zm0 8h7a4 4 0 0 1 0 8H7Z" />,
  italic: <path d="M10 4h8M6 20h8M14 4 10 20" />,
  strike: <path d="M4 12h16M8 8c0-2 2-4 4-4s4 1.5 4 3M8 16c0 2 2 4 4 4s4-1.5 4-4" />,
  underline: <path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />,
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" />
      <path d="M4 16V4h12" />
    </>
  ),
  clipboard: <path d="M9 4h6v3H9ZM6 5h3m6 0h3v16H6V5" />,
  trash: <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />,
  pin: <path d="M8 4h8m-6 0v6l-4 4h12l-4-4V4m-2 10v7" />,
  scissors: <path d="M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8 7l12 11M8 17 20 6" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" />
      <path d="m3 16 5-5 4 4 3-3 6 6M16 8h.01" />
    </>
  ),
  "image-off": (
    <>
      <rect x="3" y="4" width="18" height="16" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  smile: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <path d="M8 14s1.5 3 4 3 4-3 4-3M9 9v1m6-1v1" />
    </>
  ),
  "book-open": <path d="M12 6C9 4 5 4 2 5v14c3-1 7-1 10 1 3-2 7-2 10-1V5c-3-1-7-1-10 1Zm0 0v14" />,

  // статусы и подсказки
  info: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  help: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <path d="M10 9.5a2 2 0 1 1 3 1.7c-.7.4-1 .9-1 1.8m0 3v.5" />
    </>
  ),
  alert: (
    <>
      <rect x="3" y="3" width="18" height="18" />
      <path d="M12 7v6m0 3v.5" />
    </>
  ),
  warning: <path d="M12 3 22 20H2L12 3Zm0 6v5m0 3v.5" />,
  eye: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm8-2h4v4h-4Z" />,
  "eye-off": <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM3 3l18 18" />,
  bell: <path d="M6 17v-7a6 6 0 0 1 12 0v7l2 2H4l2-2Zm4 4h4" />,

  // люди и доступ
  user: <path d="M8 3h8v8H8Zm-4 18v-3a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3" />,
  users: <path d="M6 4h6v6H6Zm-4 16v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3m2-16h4v5h-4m1 5h2a3 3 0 0 1 3 3v3" />,
  "user-plus": <path d="M6 4h6v7H6Zm-4 17v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3m3-12v6m-3-3h6" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />,

  // управление окном (Electron)
  "chevrons-left": <path d="m11 6-6 6 6 6m8-12-6 6 6 6" />,
  "chevrons-right": <path d="m13 6 6 6-6 6M5 6l6 6-6 6" />,
  expand: <path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5" />,
  shrink: <path d="M9 4v5H4m11-5v5h5m0 6h-5v5M4 15h5v5" />,
  "window-min": <path d="M5 12h14" />,
  "window-max": <path d="M6 6h12v12H6Z" />,
  "window-restore": <path d="M9 9h9v9H9ZM9 6h9m0 0v3M6 9v9h3" />,

  // вход / выход / обмен
  login: <path d="M14 4h6v16h-6M9 8l-4 4 4 4m-4-4h11" />,
  logout: <path d="M10 4H4v16h6m5-12 4 4-4 4m4-4H9" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 20h16" />,
  upload: <path d="M12 15V3m-5 5 5-5 5 5M4 20h16" />,
  share: <path d="M12 15V3m-5 5 5-5 5 5M5 13v8h14v-8" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  "link-external": <path d="M14 4h6v6m0-6-9 9M18 14v6H4V6h6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

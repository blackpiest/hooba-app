import { appIsOnScreen } from "@/features/chat/tray-attention";
import { parseMessageContent, type MessageNode } from "@/features/chat/message-content";
import { isSelfGameRunning } from "@/features/presence/self-game-running";
import type { DesktopToastInput } from "@/shared/lib/desktop-toasts";
import { displayNameOf } from "@/shared/lib/display-name";
import { isDesktopApp } from "@/shared/lib/server-target";
import { resolveAvatarLook, useAvatarStore } from "@/stores/avatar-store";
import { useMemberProfileStore } from "@/stores/member-profile-store";
import { usePresenceStore } from "@/stores/presence-store";

const PREVIEW_LIMIT = 140;

/**
 * Тост только в десктопе, когда окно не перед глазами и не включён «Не беспокоить».
 * Во время своей игры — только «начал играть» и некликабельно: случайный клик не уводит фокус из игры.
 * Возвращает true, если тост отправлен в main.
 */
export function pushDesktopToast(toast: Omit<DesktopToastInput, "passive">): boolean {
  if (!isDesktopApp() || appIsOnScreen()) {
    return false;
  }
  if (usePresenceStore.getState().selfPreference === "dnd") {
    return false;
  }
  const inGame = isSelfGameRunning();
  if (inGame && toast.kind === "message") {
    return false;
  }
  if (!window.hoobaDesktop?.pushToast) {
    return false;
  }
  window.hoobaDesktop.pushToast({ ...toast, passive: inGame });
  return true;
}

/** Имя и аватар автора из уже загруженных сторов; без профиля — логин из события. */
export function memberToastIdentity(
  userId: number,
  fallbackName: string,
): { name: string; avatar: DesktopToastInput["avatar"] } {
  const profile = useMemberProfileStore.getState().profileByUserId[userId];
  const { catalog, avatarByUserId } = useAvatarStore.getState();
  return {
    name: profile ? displayNameOf(profile) : fallbackName,
    avatar: resolveAvatarLook(catalog, avatarByUserId[userId]),
  };
}

function plainText(nodes: MessageNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "link" || node.type === "code") {
      out += node.value;
    } else if (node.type === "emoji") {
      out += node.char;
    } else if (node.type !== "image") {
      out += plainText(node.children);
    }
  }
  return out;
}

/** Текст сообщения без разметки в одну строку; только картинки — подпись. */
export function messageToastPreview(content: string, attachmentCount: number): string {
  const text = plainText(parseMessageContent(content)).replace(/\s+/g, " ").trim();
  if (text.length > 0) {
    return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1)}…` : text;
  }
  if (attachmentCount > 1) {
    return `Изображения: ${attachmentCount}`;
  }
  return attachmentCount === 1 ? "Изображение" : "";
}

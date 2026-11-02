import type { PublicPresenceStatus } from "@/shared/presence";
import { useAvatarLook } from "@/stores/avatar-store";
import { Avatar, type AvatarLook, type AvatarSize } from "@/shared/ui/avatar";

/**
 * Аватар пользователя: достаёт косметику из стора по `userId` и рисует `Avatar`.
 * `look` перекрывает поиск по `userId` (оверлей desktop).
 */
export function UserAvatar({
  userId,
  look,
  name,
  size = "md",
  status,
  speaking = false,
}: {
  userId?: number;
  look?: AvatarLook | null;
  name: string;
  size?: AvatarSize;
  status?: PublicPresenceStatus;
  speaking?: boolean;
}) {
  const fromStore = useAvatarLook(look === undefined ? userId : undefined);
  const resolved = look === undefined ? fromStore : look;
  return <Avatar name={name} look={resolved} size={size} status={status} speaking={speaking} />;
}

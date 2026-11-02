import { useRef } from "react";
import { plural } from "@/features/challenges/condition-text";
import type { CosmeticKind } from "@/shared/api/challenges";
import type { ProfileNews } from "@/shared/api/profile-news";
import type { PresencePreference, PublicPresenceStatus } from "@/shared/presence";
import {
  AnchoredPopover,
  Button,
  DropdownMenu,
  IconButton,
  MenuItem,
  MenuSeparator,
  PopoverTitle,
  Tooltip,
  UserDock as UserDockBar,
} from "@/shared/ui";
import { presenceMenuItems } from "@/shared/ui/status-choice/presence-menu-items";
import { UserAvatar } from "@/shared/ui/user-avatar/UserAvatar";

const PROFILE_KEY = "profile";

/** Сколько названий выполненных испытаний показывать в подсказке. */
const COMPLETED_TITLES = 3;

function completedText(news: ProfileNews): string {
  const n = news.completed_count;
  if (n === 1 && news.completed.length > 0) {
    return `Вы выполнили испытание «${news.completed[0].title}».`;
  }
  const titles = news.completed.slice(0, COMPLETED_TITLES).map((c) => `«${c.title}»`);
  const rest = n - titles.length;
  const list = titles.length > 0 ? `: ${titles.join(", ")}${rest > 0 ? ` и ещё ${rest}` : ""}` : "";
  return `Вы выполнили ${n} ${plural(n, "испытание", "испытания", "испытаний")}${list}.`;
}

/** Один новый предмет — по виду: так понятно, на какой вкладке его искать. */
const ONE_ITEM: Record<CosmeticKind, string> = {
  badge: "Вам открылся новый значок.",
  title: "Вам открылся новый титул.",
  frame: "Вам открылась новая рамка.",
  background: "Вам открылся новый фон.",
  character: "Вам открылся новый персонаж.",
};

function newsText(news: ProfileNews): string {
  const parts: string[] = [];
  if (news.completed_count > 0) {
    parts.push(completedText(news));
  }
  if (news.cosmetics > 0) {
    const n = news.cosmetics;
    parts.push(
      news.completed_count > 0
        ? "Награда уже в конструкторе."
        : n === 1 && news.cosmetic_kind
          ? ONE_ITEM[news.cosmetic_kind]
          : `Вам ${plural(n, "открылся", "открылись", "открылись")} ${n} ${plural(n, "новый предмет", "новых предмета", "новых предметов")}.`,
    );
  }
  if (news.challenges > 0) {
    const n = news.challenges;
    parts.push(n === 1 ? "Появилось новое испытание." : `Появилось ${n} ${plural(n, "новое испытание", "новых испытания", "новых испытаний")}.`);
  }
  return parts.join(" ");
}

function newsAction(news: ProfileNews): string {
  if (news.cosmetics > 0) {
    return news.completed_count > 0 ? "Посмотреть награду" : "Открыть конструктор";
  }
  return "К испытаниям";
}

/** Плашка текущего пользователя: меню статуса и профиля, кнопка настроек, подсказка о новинках конструктора. */
export function UserDock({
  userId,
  username,
  preference,
  badge,
  statusLabel,
  news,
  onEditProfile,
  onOpenNews,
  onDismissNews,
  onPresence,
  onSettings,
}: {
  userId: number | undefined;
  username: string;
  preference: PresencePreference;
  badge: PublicPresenceStatus;
  statusLabel: string;
  /** Новинки конструктора; null — подсказки нет. */
  news: ProfileNews | null;
  onEditProfile: () => void;
  onOpenNews: () => void;
  onDismissNews: () => void;
  onPresence: (status: PresencePreference) => void;
  onSettings: () => void;
}) {
  const userButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <UserDockBar
        userButtonRef={userButtonRef}
        avatar={<UserAvatar userId={userId} name={username} status={badge} />}
        name={username}
        subtitle={statusLabel}
        userLabel={`Статус: ${statusLabel}`}
        wrapUser={(trigger) => (
          <DropdownMenu
            trigger={trigger}
            placement="top start"
            onOpenChange={(open) => {
            // Нажал на свою плашку — подсказку увидел: закрываем её, чтобы не накрывала меню.
            if (open && news) onDismissNews();
          }}
            aria-label="Статус"
            selectionMode="single"
            selectedKeys={[preference]}
            onAction={(key) => {
              if (key === PROFILE_KEY) {
                onEditProfile();
              } else if (key !== preference) {
                onPresence(key as PresencePreference);
              }
            }}
          >
            <MenuItem id={PROFILE_KEY} textValue="Редактировать профиль">
              <span className="flex items-center gap-3">
                <UserAvatar userId={userId} name={username} size="xl" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{username}</span>
                  <span className="text-xs text-muted">Редактировать профиль</span>
                </span>
              </span>
            </MenuItem>
            <MenuSeparator />
            {presenceMenuItems()}
          </DropdownMenu>
        )}
      >
        <Tooltip content="Настройки">
          <IconButton icon="gear" label="Настройки" onPress={onSettings} />
        </Tooltip>
      </UserDockBar>
      <AnchoredPopover
        triggerRef={userButtonRef}
        isOpen={news !== null}
        onClose={onDismissNews}
        aria-label="Обновления профиля"
      >
        {news ? (
          <>
            <PopoverTitle>Обновления профиля</PopoverTitle>
            <p>{newsText(news)}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onPress={onOpenNews}>
                {newsAction(news)}
              </Button>
              <Button size="sm" variant="ghost" onPress={onDismissNews}>
                Позже
              </Button>
            </div>
          </>
        ) : null}
      </AnchoredPopover>
    </>
  );
}

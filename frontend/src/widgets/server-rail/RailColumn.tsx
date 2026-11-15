import type { MouseEvent, ReactNode } from "react";
import { Divider, ServerRailItem } from "@/shared/ui";
import type { RailServer } from "./rail-servers";

export type RailColumnProps = {
  servers: RailServer[];
  /** Адрес открытого сервера: его плитка активна. `null` — экран входа, активна «+». */
  current: string | null;
  onServer?: (server: RailServer) => void;
  onServerContextMenu?: (server: RailServer, event: MouseEvent<HTMLDivElement>) => void;
  onPlus?: () => void;
  /** Шестерёнка настроек внизу. */
  onSettings?: () => void;
  /** Показать шестерёнку и без `onSettings` — неактивной (сплэш: окно настроек ещё не загружено). */
  showSettings?: boolean;
  /** Только вид, без действий: сплэш, пока грузится код приложения. */
  isStatic?: boolean;
  /** Меню и диалоги панели. */
  children?: ReactNode;
};

/**
 * Разметка панели серверов. Общая для живой панели и её копии на сплэше: плитки стоят на тех же местах,
 * и при смене экрана панель не прыгает.
 */
export function RailColumn({
  servers,
  current,
  onServer,
  onServerContextMenu,
  onPlus,
  onSettings,
  showSettings = false,
  isStatic = false,
  children,
}: RailColumnProps) {
  return (
    // Плитки 48px стоят по центру соседних строк сайдбара, а не по общему отступу: первая — по шапке сервера
    // (отступ оболочки 8 + рамка 1 + шапка 52 с нижней линией → pt 10), шестерёнка — по доку пользователя
    // (8 + рамка 1 + док 56 с верхней линией → pb 13). Меняя высоту шапки или дока, поправить и здесь.
    <div className="flex w-[64px] shrink-0 flex-col pt-[10px] pb-[13px]">
      <nav aria-label="Серверы" className="flex min-h-0 flex-1 flex-col items-stretch gap-2 overflow-y-auto">
        {servers.map((server) => {
          const isCurrent = server.origin === current;
          return (
            <ServerRailItem
              key={server.origin}
              label={server.name}
              src={server.icon}
              isActive={isCurrent}
              isDisabled={isStatic}
              onPress={isCurrent || !onServer ? undefined : () => onServer(server)}
              onContextMenu={
                onServerContextMenu
                  ? (event) => {
                      event.preventDefault();
                      onServerContextMenu(server, event);
                    }
                  : undefined
              }
            />
          );
        })}
        <div className="px-4">
          <Divider />
        </div>
        <ServerRailItem
          label="Войти на другой сервер"
          icon="plus"
          isActive={current === null}
          isDisabled={isStatic}
          onPress={onPlus}
        />
      </nav>
      {onSettings || showSettings ? (
        <div className="flex shrink-0 flex-col pt-2">
          <ServerRailItem label="Настройки" icon="gear" isDisabled={isStatic || !onSettings} onPress={onSettings} />
        </div>
      ) : null}
      {children}
    </div>
  );
}

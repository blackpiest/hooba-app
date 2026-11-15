import type { MouseEvent } from "react";
import { Button as AriaButton } from "react-aria-components";
import { cx } from "@/utils/cx";
import { Icon, type IconName } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";
import { ServerIcon } from "./ServerIcon";

type ServerRailItemBase = {
  /** Подпись: подсказка справа и aria-label. */
  label: string;
  /** Текущий сервер: высокая метка слева, плитка подсвечена. */
  isActive?: boolean;
  isDisabled?: boolean;
  onPress?: () => void;
  /** Меню по правому клику (координаты — `event.clientX/Y`). */
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  className?: string;
};

export type ServerRailItemProps = ServerRailItemBase &
  (
    | { /** Аватар сервера (готовая ссылка или data URL). */ src: string | null; icon?: never }
    | { /** Плитка-действие с иконкой вместо аватара («добавить сервер»). */ icon: IconName; src?: never }
  );

/**
 * Плитка панели серверов (desktop): аватар 48px и метка слева — короткая при наведении, высокая у текущего.
 */
export function ServerRailItem({
  label,
  isActive = false,
  isDisabled,
  onPress,
  onContextMenu,
  className,
  ...rest
}: ServerRailItemProps) {
  return (
    <div className="flex" onContextMenu={onContextMenu}>
      {/* У активной плитки подсказки нет: название открытого сервера и так видно в шапке сайдбара. */}
      <Tooltip content={isActive ? undefined : label} placement="right">
        <AriaButton
          aria-label={label}
          aria-current={isActive ? "true" : undefined}
          isDisabled={isDisabled}
          onPress={onPress}
          className={cx(
            "group relative flex w-full cursor-pointer justify-center ds-focus data-[pressed]:translate-y-px data-[disabled]:cursor-default",
            className,
          )}
        >
          <span
            aria-hidden="true"
            className={cx(
              "absolute left-0 top-1/2 w-1 -translate-y-1/2 bg-fg transition-[height,opacity] duration-150",
              isActive ? "h-10 opacity-100" : "h-2 opacity-0 group-data-[hovered]:h-5 group-data-[hovered]:opacity-100",
            )}
          />
          {"icon" in rest && rest.icon ? (
            <span className="grid size-12 place-items-center border border-line bg-bg text-muted group-data-[hovered]:border-line-strong group-data-[hovered]:text-fg">
              <Icon name={rest.icon} size="md" />
            </span>
          ) : (
            <ServerIcon
              name={label}
              src={"src" in rest ? (rest.src ?? null) : null}
              size="xl"
              className={cx(
                !isActive && "opacity-70 group-data-[hovered]:opacity-100",
                isActive && "border-line-strong",
              )}
            />
          )}
        </AriaButton>
      </Tooltip>
    </div>
  );
}

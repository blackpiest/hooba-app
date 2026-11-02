import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import { MenuItem, MenuSeparator } from "@/shared/ui";
import { PRESENCE_MENU } from "./presence-menu";

/**
 * Пункты выбора статуса для `Menu` / `DropdownMenu` с `selectionMode="single"`: «В сети», разделитель, остальные.
 * Это функция, а не компонент: коллекция меню react-aria должна видеть `MenuItem` напрямую.
 */
export function presenceMenuItems(): ReactNode[] {
  const [online, ...others] = PRESENCE_MENU;
  return [online, "separator" as const, ...others].map((item) =>
    item === "separator" ? (
      <MenuSeparator key="separator" />
    ) : (
      <MenuItem key={item.id} id={item.id} textValue={item.label}>
        <span className="flex items-start gap-2.5">
          <span className={cx("mt-[5px] size-2.5 shrink-0", item.dot)} aria-hidden="true" />
          <span className="flex flex-col whitespace-normal">
            <span>{item.label}</span>
            {item.hint ? <span className="mt-0.5 text-[11px] leading-snug text-muted">{item.hint}</span> : null}
          </span>
        </span>
      </MenuItem>
    ),
  );
}

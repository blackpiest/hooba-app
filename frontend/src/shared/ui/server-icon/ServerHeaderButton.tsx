import { forwardRef, type ReactNode } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { Icon } from "@/shared/ui/icon";
import { ServerIcon } from "./ServerIcon";

export type ServerHeaderButtonProps = Omit<AriaButtonProps, "className" | "style" | "children"> & {
  name: string;
  /** Готовая ссылка на аватар сервера; null — буква. */
  src: string | null;
  /** Метка у стрелки: счётчик или точка «есть новое» внутри меню. */
  indicator?: ReactNode;
};

/** Название сервера в шапке сайдбара: аватар, имя и стрелка — открывает меню сервера (`DropdownMenu`). */
export const ServerHeaderButton = forwardRef<HTMLButtonElement, ServerHeaderButtonProps>(function ServerHeaderButton(
  { name, src, indicator, ...props },
  ref,
) {
  return (
    <AriaButton
      ref={ref}
      {...props}
      className="group ds-focus flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 pl-1 pr-1.5 text-left outline-none data-[hovered]:bg-surface data-[pressed]:bg-surface"
    >
      <ServerIcon name={name} src={src} size="md" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {indicator ? <span className="flex shrink-0 items-center">{indicator}</span> : null}
      <Icon
        name="chevron-down"
        size="sm"
        className="shrink-0 text-muted transition-transform group-data-[hovered]:text-fg group-aria-expanded:rotate-180"
      />
    </AriaButton>
  );
});

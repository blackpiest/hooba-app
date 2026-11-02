import type { ReactNode } from "react";
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  type TabListProps,
  type TabPanelProps as AriaTabPanelProps,
  type TabProps as AriaTabProps,
  type TabsProps as AriaTabsProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";

export type TabsProps = Omit<AriaTabsProps, "className" | "style"> & { className?: string };

/**
 * Вкладки. Композиция:
 * `<Tabs><TabList aria-label="Настройки"><Tab id="a">А</Tab></TabList><TabPanel id="a">…</TabPanel></Tabs>`
 * Стрелки переключают вкладки, Tab уходит в панель — react-aria. `orientation="vertical"` — столбцом.
 */
export function Tabs({ className, ...props }: TabsProps) {
  return <AriaTabs {...props} className={cx("group flex flex-col data-[orientation=vertical]:flex-row", className)} />;
}

export function TabList<T extends object>({ className, ...props }: Omit<TabListProps<T>, "className" | "style"> & { className?: string }) {
  return (
    <AriaTabList
      {...props}
      className={cx(
        "flex gap-0.5 border-b border-line",
        "group-data-[orientation=vertical]:w-44 group-data-[orientation=vertical]:shrink-0 group-data-[orientation=vertical]:flex-col group-data-[orientation=vertical]:border-b-0 group-data-[orientation=vertical]:border-r",
        className,
      )}
    />
  );
}

export type TabProps = Omit<AriaTabProps, "className" | "style" | "children"> & {
  children: ReactNode;
};

export function Tab({ children, ...props }: TabProps) {
  return (
    <AriaTab
      {...props}
      className={cx(
        "relative inline-flex cursor-pointer items-center gap-2 px-4 py-3 font-label text-[10px] uppercase leading-none tracking-[0.1em] text-muted outline-none",
        "data-[hovered]:bg-surface data-[hovered]:text-fg",
        "data-[selected]:bg-brand-soft data-[selected]:text-brand-fg data-[selected]:shadow-[inset_0_-2px_0_var(--color-brand)]",
        "group-data-[orientation=vertical]:data-[selected]:shadow-[inset_-2px_0_0_var(--color-brand)]",
        "data-[focus-visible]:[outline:var(--ds-focus-ring)] data-[focus-visible]:-outline-offset-2",
        "data-[disabled]:cursor-not-allowed data-[disabled]:text-disabled-text",
      )}
    >
      {children}
    </AriaTab>
  );
}

export type TabPanelProps = Omit<AriaTabPanelProps, "className" | "style"> & { className?: string };

export function TabPanel({ className, ...props }: TabPanelProps) {
  return (
    <AriaTabPanel
      {...props}
      className={cx("flex-1 py-5 outline-none data-[focus-visible]:[outline:var(--ds-focus-ring)]", "group-data-[orientation=vertical]:px-6 group-data-[orientation=vertical]:py-0", className)}
    />
  );
}

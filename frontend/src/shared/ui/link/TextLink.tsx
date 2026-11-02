import type { AnchorHTMLAttributes } from "react";
import { cx } from "@/utils/cx";
import { linkClass } from "./link-styles";

/** Ссылка внутри текста. Для роутера: `<Link to="…" className={linkClass}>` (react-router-dom). */
export function TextLink({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a draggable={false} {...props} className={cx(linkClass, className)} />;
}

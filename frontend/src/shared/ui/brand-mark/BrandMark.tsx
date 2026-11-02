import { Slime, type SlimeProps } from "@/shared/ui/slime";

/** Метка бренда — слайм-маскот (статичная поза). Цвета — токены `--color-slime*`. */
export function BrandMark(props: Omit<SlimeProps, "pose">) {
  return <Slime pose="still" {...props} />;
}

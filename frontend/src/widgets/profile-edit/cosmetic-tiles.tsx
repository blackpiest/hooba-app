import { frameSkin, Icon, ProfileBackground, type BackgroundSpec, type FrameSpec } from "@/shared/ui";
import { cx } from "@/utils/cx";

/** Миниатюра рамки: грань, обводка окна и кайма в цветах скина. null — базовая рамка. */
export function FrameTileArt({ spec }: { spec: FrameSpec | null }) {
  const { className, style } = frameSkin(spec);
  return (
    <span className={cx("absolute inset-0 bg-[var(--frame)] p-[7px]", className)} style={style}>
      <span className="block size-full bg-brand-soft shadow-[0_0_0_2px_var(--frame-line)]" />
    </span>
  );
}

/** Миниатюра фона без движения. null — «нет»: цвет бренда. */
export function BackgroundTileArt({ spec }: { spec: BackgroundSpec | null }) {
  if (!spec) {
    return (
      <span className="absolute inset-0 grid place-items-center bg-brand-soft font-label text-[9px] uppercase tracking-[0.08em] text-muted">
        Нет
      </span>
    );
  }
  return <ProfileBackground spec={spec} still />;
}

/** Затемнение с замком поверх закрытой плитки. */
export function LockedTileOverlay({ className }: { className?: string }) {
  return (
    <span className={cx("absolute inset-0 grid place-items-center bg-bg/60 text-muted", className)}>
      <Icon name="lock" size="sm" />
    </span>
  );
}

/** Галочка в углу: значок закреплён на карточке. */
export function PinnedTileMark() {
  return (
    <span className="absolute right-0 top-0 grid size-4 place-items-center bg-brand text-brand-fg">
      <Icon name="check" size="xs" />
    </span>
  );
}

/** Метка внизу плитки: предмет выдан, а участник на него ещё не нажимал. */
export function NewTileMark() {
  return (
    <span className="absolute bottom-0 left-0 bg-accent px-1 py-0.5 font-label text-[8px] uppercase leading-none tracking-[0.08em] text-on-accent">
      Новое
    </span>
  );
}

/** Метка в углу для владельца: предмет «в запасе» — остальные видят его, только если получили. */
export function ReservedTileMark() {
  return (
    <span className="absolute left-0 top-0 grid size-4 place-items-center bg-surface text-muted" title="В запасе">
      <Icon name="eye-off" size="xs" />
    </span>
  );
}

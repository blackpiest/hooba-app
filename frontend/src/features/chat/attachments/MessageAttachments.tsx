import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Icon } from "@/shared/ui";
import { cx } from "@/utils/cx";
import { useIsTouch } from "@/hooks/use-breakpoint";
import { contextMenuEventAt, useLongPress } from "@/shared/lib/use-long-press";
import { attachmentSrc, type AttachmentDto } from "@/shared/api/attachments";
import { singleImageBox } from "./attachment-layout";
import { ImageContextMenu, type ImageMenuState } from "./ImageContextMenu";
import { ImageLightbox } from "./ImageLightbox";

function Tile({
  attachment,
  className,
  style,
  onOpen,
  onMenu,
}: {
  attachment: AttachmentDto;
  className?: string;
  style?: CSSProperties;
  onOpen: () => void;
  onMenu: (event: MouseEvent, attachment: AttachmentDto) => void;
}) {
  const [broken, setBroken] = useState(false);
  // Тач: долгое нажатие на картинку — её меню, а не меню сообщения.
  const isTouch = useIsTouch();
  const longPress = useLongPress(isTouch ? (point) => onMenu(contextMenuEventAt(point), attachment) : null);
  const src = attachmentSrc(attachment.thumb_url);
  if (attachment.purged || !src || broken) {
    return (
      <div
        className={cx(
          "flex flex-col items-center justify-center gap-1 border border-dashed border-line-strong bg-surface p-2 text-center text-[11px] text-muted",
          className,
        )}
        style={style}
        role="img"
        aria-label={attachment.purged ? "Изображение удалено" : "Изображение недоступно"}
      >
        <Icon name="image-off" />
        <span>{attachment.purged ? "Изображение удалено из хранилища" : "Не удалось загрузить"}</span>
      </div>
    );
  }
  return (
    // Контекстное меню — на обёртке: у кнопки react-aria нет onContextMenu.
    <div className={cx("overflow-hidden border border-line bg-surface", className)} style={style} onContextMenu={(event) => onMenu(event, attachment)} {...longPress}>
      <AriaButton
        aria-label={`Открыть ${attachment.name}`}
        className="ds-focus group/tile block size-full cursor-zoom-in outline-none"
        onPress={onOpen}
      >
        <img
          src={src}
          alt={attachment.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover transition-opacity group-data-[hovered]/tile:opacity-90"
          onError={() => setBroken(true)}
        />
      </AriaButton>
    </div>
  );
}

/** Картинки сообщения: 1 — по пропорциям; 2 — в ряд; 3 — большая слева и две справа; 4 — сетка 2×2. */
export function MessageAttachments({ attachments }: { attachments: AttachmentDto[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<ImageMenuState | null>(null);
  if (attachments.length === 0) {
    return null;
  }
  const open = (index: number) => () => setOpenIndex(index);
  // Своё меню вместо меню сообщения (строка ленты тоже слушает contextmenu).
  const onMenu = (event: MouseEvent, attachment: AttachmentDto) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, attachment });
  };

  let grid: ReactNode;
  const only = attachments.length === 1 ? attachments[0] : undefined;
  if (only) {
    const box = singleImageBox(only.width, only.height);
    grid = <Tile attachment={only} style={{ width: box.width, height: box.height, maxWidth: "100%" }} onOpen={open(0)} onMenu={onMenu} />;
  } else if (attachments.length === 2) {
    grid = (
      <div className="grid h-[200px] w-full max-w-[420px] grid-cols-2 gap-1 max-md:h-[160px]">
        {attachments.map((item, index) => (
          <Tile key={item.id} attachment={item} className="size-full" onOpen={open(index)} onMenu={onMenu} />
        ))}
      </div>
    );
  } else if (attachments.length === 3) {
    grid = (
      <div className="grid h-[280px] w-full max-w-[420px] grid-cols-[2fr_1fr] grid-rows-2 gap-1 max-md:h-[220px]">
        {attachments.map((item, index) => (
          <Tile
            key={item.id}
            attachment={item}
            className={index === 0 ? "row-span-2 size-full" : "size-full"}
            onOpen={open(index)}
            onMenu={onMenu}
          />
        ))}
      </div>
    );
  } else {
    grid = (
      <div className="grid h-[320px] w-full max-w-[420px] grid-cols-2 grid-rows-2 gap-1 max-md:h-[260px]">
        {attachments.map((item, index) => (
          <Tile key={item.id} attachment={item} className="size-full" onOpen={open(index)} onMenu={onMenu} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-1">
      {grid}
      {menu ? <ImageContextMenu key={`${menu.attachment.id}:${menu.x}:${menu.y}`} menu={menu} onClose={() => setMenu(null)} /> : null}
      {openIndex !== null ? (
        <ImageLightbox attachments={attachments} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
      ) : null}
    </div>
  );
}

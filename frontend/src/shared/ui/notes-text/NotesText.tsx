import { useMemo } from "react";
import { MessageText } from "@/shared/ui/message-text/MessageText";
import { openExternalHttps } from "@/shared/ui/message-text/https-links";
import { parseNotes, type NotesBlock } from "./notes-content";

function renderBlock(block: NotesBlock, key: number) {
  switch (block.type) {
    case "heading":
      return (
        <h3 key={key} className="mt-1 font-heading text-[15px] font-semibold text-fg">
          <MessageText text={block.text} onExternalLink={openExternalHttps} />
        </h3>
      );
    case "item":
      return (
        <div key={key} className="flex gap-2 pl-1">
          <span aria-hidden className="text-brand">
            •
          </span>
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            <MessageText text={block.text} onExternalLink={openExternalHttps} />
          </p>
        </div>
      );
    case "paragraph":
      return (
        <p key={key} className="whitespace-pre-wrap break-words">
          <MessageText text={block.text} onExternalLink={openExternalHttps} />
        </p>
      );
    case "gap":
      return <div key={key} aria-hidden className="h-2" />;
    default:
      return null;
  }
}

/** Многострочный текст заметок: `#` — заголовок, `-` — пункт, пустая строка — отступ, инлайн-разметка как в чате. */
export function NotesText({ body }: { body: string }) {
  const blocks = useMemo(() => parseNotes(body), [body]);
  return <div className="flex flex-col gap-1.5 text-sm leading-relaxed text-fg">{blocks.map(renderBlock)}</div>;
}

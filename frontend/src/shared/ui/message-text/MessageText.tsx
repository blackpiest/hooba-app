import type { ReactNode } from "react";
import { parseMessageContent, type MessageNode } from "@/features/chat/message-content";

const linkClass =
  "inline cursor-pointer break-all text-left text-brand-text underline decoration-brand-text underline-offset-2 hover:opacity-80";

function renderMessageNode(node: MessageNode, key: string, onExternalLink: (url: string) => void): ReactNode {
  switch (node.type) {
    case "text":
      return <span key={key}>{node.value}</span>;
    case "link":
      return (
        <button key={key} type="button" className={linkClass} onClick={() => onExternalLink(node.value)}>
          {node.value}
        </button>
      );
    case "emoji":
      return <span key={key}>{node.char}</span>;
    case "image":
      return (
        <img
          key={key}
          src={node.src}
          alt={`:${node.name}:`}
          className="mx-px inline-block size-5 align-text-bottom"
          draggable={false}
        />
      );
    case "code":
      return (
        <code key={key} className="bg-elevated px-1 font-mono text-[0.92em]">
          {node.value}
        </code>
      );
    case "bold":
      return (
        <strong key={key} className="font-semibold">
          {node.children.map((child, index) => renderMessageNode(child, `${key}-${index}`, onExternalLink))}
        </strong>
      );
    case "italic":
      return (
        <em key={key}>{node.children.map((child, index) => renderMessageNode(child, `${key}-${index}`, onExternalLink))}</em>
      );
    case "strike":
      return (
        <span key={key} className="line-through">
          {node.children.map((child, index) => renderMessageNode(child, `${key}-${index}`, onExternalLink))}
        </span>
      );
    case "underline":
      return (
        <span key={key} className="underline underline-offset-2">
          {node.children.map((child, index) => renderMessageNode(child, `${key}-${index}`, onExternalLink))}
        </span>
      );
    default:
      return null;
  }
}

export function MessageText({
  text,
  onExternalLink,
}: {
  text: string;
  onExternalLink: (url: string) => void;
}) {
  return parseMessageContent(text).map((node, index) => renderMessageNode(node, String(index), onExternalLink));
}

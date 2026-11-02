/** Строчные блоки заметок (релиз-ноты, объявления); инлайн-разметка внутри — как в чате (`MessageText`). */
export type NotesBlock =
  | { type: "heading"; text: string }
  | { type: "item"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "gap" };

const HEADING = /^#{1,3}\s+(.*)$/;
const ITEM = /^[-*]\s+(.*)$/;

/** `# `/`## ` — заголовок, `- `/`* ` — пункт списка, подряд идущие строки — абзац с переносами, пустая строка — отступ. */
export function parseNotes(body: string): NotesBlock[] {
  const blocks: NotesBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };

  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      if (blocks.length > 0 && blocks[blocks.length - 1].type !== "gap") {
        blocks.push({ type: "gap" });
      }
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", text: heading[1].trim() });
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      flushParagraph();
      blocks.push({ type: "item", text: item[1].trim() });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();

  while (blocks.length > 0 && blocks[blocks.length - 1].type === "gap") {
    blocks.pop();
  }
  return blocks;
}

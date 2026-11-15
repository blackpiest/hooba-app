/**
 * Абзац из предложений: каждое передаётся законченным, с точкой; пустые пропускаются.
 * Точка в конце абзаца убирается — так пишутся описания в диалогах.
 */
export function sentences(...parts: (string | null | false | undefined)[]): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .replace(/\.$/, "");
}

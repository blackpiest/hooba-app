/** null — буфер прочитать не удалось; пустая строка — в буфере нет текста. */
export async function readClipboardText(): Promise<string | null> {
  const readClipboard = window.hoobaDesktop?.readClipboard;
  if (readClipboard) {
    try {
      const text = await readClipboard();
      return typeof text === "string" ? text : "";
    } catch {
      return null;
    }
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/**
 * Картинка в буфер обмена. Принимается промис PNG: Safari требует вызвать `clipboard.write` синхронно
 * в обработчике клика, а скачивание и перекодирование идут уже внутри.
 */
export async function writeClipboardImage(png: Promise<Blob>): Promise<boolean> {
  const desktop = window.hoobaDesktop;
  if (desktop?.writeClipboardImage) {
    try {
      return await desktop.writeClipboardImage(new Uint8Array(await (await png).arrayBuffer()));
    } catch {
      return false;
    }
  }
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    return false;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    return false;
  }
}

export async function writeClipboardText(text: string): Promise<boolean> {
  const writeClipboard = window.hoobaDesktop?.writeClipboard;
  if (writeClipboard) {
    try {
      return await writeClipboard(text);
    } catch {
      return false;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* запасной путь, если Clipboard API недоступен */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  return copied;
}

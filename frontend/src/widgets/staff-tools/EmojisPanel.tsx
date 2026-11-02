import { useEffect, useState } from "react";
import { FileTrigger } from "react-aria-components";
import { imageSize } from "@/features/chat/attachments/prepare-image";
import { formatApiError } from "@/shared/api/format-error";
import {
  deleteCustomEmoji,
  EMOJI_ACCEPT,
  EMOJI_MAX_INPUT_SIDE,
  EMOJI_MIN_SIDE,
  emojiNameFromFile,
  MAX_CUSTOM_EMOJIS,
  MAX_EMOJI_UPLOAD_BYTES,
  normalizeEmojiName,
  renameCustomEmoji,
  uploadCustomEmoji,
  type CustomEmojiDto,
} from "@/shared/api/emojis";
import { apiUrl } from "@/shared/api/http";
import { Alert, Button, ConfirmDialog, EmptyState, FieldGroup, Icon, IconButton, TextField } from "@/shared/ui";
import { cx } from "@/utils/cx";
import { useEmojiStore } from "@/stores/emoji-store";
import { PanelIntro } from "./panel-layout";

const ACCEPTED = EMOJI_ACCEPT.split(",");
const NAME_HINT = "Имя: 2–32 символа, латиница в нижнем регистре, цифры и «_».";

async function fileProblem(file: File): Promise<string | null> {
  if (!ACCEPTED.includes(file.type)) {
    return "Можно загружать только PNG, JPEG и WebP.";
  }
  if (file.size > MAX_EMOJI_UPLOAD_BYTES) {
    return `Файл больше ${MAX_EMOJI_UPLOAD_BYTES / 1024} КБ.`;
  }
  try {
    const { width, height } = await imageSize(file);
    if (Math.min(width, height) < EMOJI_MIN_SIDE) {
      return `Картинка меньше ${EMOJI_MIN_SIDE}×${EMOJI_MIN_SIDE}.`;
    }
    if (Math.max(width, height) > EMOJI_MAX_INPUT_SIDE) {
      return `Картинка больше ${EMOJI_MAX_INPUT_SIDE}×${EMOJI_MAX_INPUT_SIDE}.`;
    }
  } catch {
    return "Файл повреждён или это не картинка.";
  }
  return null;
}

function EmojiRow({ emoji, onDelete }: { emoji: CustomEmojiDto; onDelete: (emoji: CustomEmojiDto) => void }) {
  const [draft, setDraft] = useState(emoji.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rename() {
    const name = normalizeEmojiName(draft);
    if (!name) {
      setError(NAME_HINT);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await renameCustomEmoji(emoji.id, name);
      await useEmojiStore.getState().load();
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message) : "Не удалось переименовать");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-1.5 border border-line bg-surface p-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void rename();
        }}
      >
        <span className="grid size-11 shrink-0 place-items-center bg-bg">
          <img src={apiUrl(emoji.url)} alt={`:${emoji.name}:`} className="size-8 object-contain" draggable={false} />
        </span>
        <TextField aria-label="Имя реакции" className="min-w-0 flex-1" value={draft} onChange={setDraft} maxLength={32} />
        {draft !== emoji.name ? (
          <Button type="submit" size="sm" isPending={busy}>
            Сохранить
          </Button>
        ) : null}
        <IconButton icon="trash" label="Удалить реакцию" variant="danger" onPress={() => onDelete(emoji)} />
      </form>
      {error ? <p className="px-1 text-[11px] leading-relaxed text-danger">{error}</p> : null}
    </li>
  );
}

/** Свои реакции сообщества (только OWNER): до 32 картинок, используются только как реакции на сообщения. */
export function EmojisPanel() {
  const emojis = useEmojiStore((s) => s.emojis);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomEmojiDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const full = emojis.length >= MAX_CUSTOM_EMOJIS;

  useEffect(() => {
    void useEmojiStore.getState().load();
  }, []);

  // Превью выбранного файла: ссылка освобождается при замене и при уходе с вкладки.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function choose(next: File | null) {
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function pick(next: File) {
    setError(null);
    const problem = await fileProblem(next);
    if (problem) {
      choose(null);
      setError(problem);
      return;
    }
    choose(next);
    setName((current) => current || emojiNameFromFile(next.name));
  }

  async function upload() {
    if (!file) {
      return;
    }
    const normalized = normalizeEmojiName(name);
    if (!normalized) {
      setError(NAME_HINT);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadCustomEmoji(normalized, file);
      await useEmojiStore.getState().load();
      choose(null);
      setName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message) : "Не удалось загрузить реакцию");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    try {
      await deleteCustomEmoji(pendingDelete.id);
      await useEmojiStore.getState().load();
      setPendingDelete(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message) : "Не удалось удалить реакцию");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelIntro>
        Свои реакции появляются у всех в панели выбора реакции, в категории «Специальные». В тексте сообщений их
        использовать нельзя.
      </PanelIntro>

      <FieldGroup
        title="Новая реакция"
        aside={
          <span className={cx("font-label text-[11px] tabular-nums", full ? "text-danger" : "text-muted")}>
            {emojis.length} / {MAX_CUSTOM_EMOJIS}
          </span>
        }
      >
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void upload();
          }}
        >
          <span
            className={cx(
              "grid size-11 shrink-0 place-items-center border bg-bg",
              preview ? "border-line" : "border-dashed border-line-strong text-muted",
            )}
          >
            {preview ? (
              <img src={preview} alt="" className="size-8 object-contain" draggable={false} />
            ) : (
              <Icon name="image" size="sm" />
            )}
          </span>
          <FileTrigger
            acceptedFileTypes={ACCEPTED}
            onSelect={(files) => {
              const next = files?.[0];
              if (next) {
                void pick(next);
              }
            }}
          >
            <Button variant="secondary" leadingIcon="upload" isDisabled={full || busy}>
              {file ? "Другая" : "Картинка"}
            </Button>
          </FileTrigger>
          <TextField
            aria-label="Имя новой реакции"
            className="min-w-40 flex-1"
            value={name}
            onChange={setName}
            maxLength={32}
            isDisabled={full}
            placeholder="имя, напр. party_parrot"
          />
          <Button type="submit" isPending={busy} isDisabled={full || !file || !name.trim()}>
            Загрузить
          </Button>
        </form>
        <p className="text-[11px] leading-relaxed text-muted">
          {full
            ? "Лимит достигнут — удалите ненужные."
            : `PNG, JPEG или WebP до ${MAX_EMOJI_UPLOAD_BYTES / 1024} КБ, от ${EMOJI_MIN_SIDE} до ${EMOJI_MAX_INPUT_SIDE} px по стороне. Сервер уменьшит картинку до 128×128, анимация не сохраняется.`}
        </p>
        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
      </FieldGroup>

      <FieldGroup title="Загруженные" description="Удалённая реакция пропадёт со всех сообщений, где её поставили.">
        {emojis.length === 0 ? (
          <EmptyState compact title="Своих реакций пока нет." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {emojis.map((emoji) => (
              // Ключ с именем: после переименования поле начинается с нового имени.
              <EmojiRow key={`${emoji.id}:${emoji.name}`} emoji={emoji} onDelete={setPendingDelete} />
            ))}
          </ul>
        )}
      </FieldGroup>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={`Удалить реакцию :${pendingDelete?.name ?? ""}:?`}
        description="Она пропадёт со всех сообщений, где её поставили. Вернуть нельзя."
        confirmLabel="Удалить"
        tone="danger"
        isPending={deleting}
      />
    </div>
  );
}

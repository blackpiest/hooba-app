import { useState } from "react";
import { FileTrigger } from "react-aria-components";
import { prepareServerIconFile } from "@/features/server-icon/server-icon-file";
import { formatApiError } from "@/shared/api/format-error";
import { SERVER_ICON_ACCEPT, SERVER_ICON_MIN_SIDE } from "@/shared/api/server-settings";
import { Button, ServerIcon } from "@/shared/ui";

const ACCEPTED = SERVER_ICON_ACCEPT.split(",");

export type ServerIconPickerProps = {
  /** Название сервера — для буквы-заглушки. */
  name: string;
  /** Что показать сейчас: ссылка на загруженный аватар или object URL выбранного файла. */
  src: string | null;
  /** Получает уже сжатый квадрат. Ошибка из промиса показывается под полем. */
  onChange: (file: File) => Promise<void> | void;
  /** Нет — кнопки «Убрать» нет. */
  onRemove?: () => Promise<void> | void;
  isDisabled?: boolean;
};

/** Выбор аватара сервера: проверка и сжатие в браузере, превью, «Убрать». */
export function ServerIconPicker({ name, src, onChange, onRemove, isDisabled = false }: ServerIconPickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void> | void, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message) : fallback);
    } finally {
      setBusy(false);
    }
  }

  function pick(next: File) {
    void run(async () => {
      const prepared = await prepareServerIconFile(next);
      if ("error" in prepared) {
        setError(prepared.error);
        return;
      }
      await onChange(prepared.file);
    }, "Не удалось загрузить аватар");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <ServerIcon name={name} src={src} size="profile" />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <FileTrigger
              acceptedFileTypes={ACCEPTED}
              onSelect={(files) => {
                const next = files?.[0];
                if (next) {
                  pick(next);
                }
              }}
            >
              <Button size="sm" variant="secondary" leadingIcon="upload" isDisabled={isDisabled || busy} isPending={busy}>
                {src ? "Заменить" : "Выбрать картинку"}
              </Button>
            </FileTrigger>
            {onRemove && src ? (
              <Button
                size="sm"
                variant="danger-ghost"
                leadingIcon="trash"
                isDisabled={isDisabled || busy}
                onPress={() => void run(onRemove, "Не удалось убрать аватар")}
              >
                Убрать
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted">
            PNG, JPEG или WebP, не меньше {SERVER_ICON_MIN_SIDE}×{SERVER_ICON_MIN_SIDE} px. Картинка обрезается по
            центру до квадрата и сжимается.
          </p>
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

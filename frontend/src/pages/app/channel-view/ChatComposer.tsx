import { useCallback, useEffect, useState, type RefObject } from "react";
import { FileTrigger } from "react-aria-components";
import { ATTACHMENT_ACCEPT, type AttachmentDto } from "@/shared/api/attachments";
import { AttachmentTray } from "@/features/chat/attachments/AttachmentTray";
import { useAttachmentTray } from "@/features/chat/attachments/use-attachment-tray";
import {
  canSendMessageDraft,
  canonicalMessageContent,
  canonicalMessageLength,
} from "@/features/chat/message-content";
import { MessageComposer } from "@/features/chat/message-composer/MessageComposer";
import { Button, IconButton } from "@/shared/ui";
import { useIsTouch } from "@/hooks/use-breakpoint";

export type ComposerAttachApi = { addFiles: (files: File[]) => void };

const ACCEPTED_TYPES = ATTACHMENT_ACCEPT.split(",");

/** Черновик и лоток картинок живут здесь: набор текста и прогресс загрузки не перерисовывают ленту. */
export function ChatComposer({
  channelId,
  channelName,
  canAttach,
  attachApiRef,
  onAttachError,
  onSend,
}: {
  channelId: number;
  channelName: string;
  canAttach: boolean;
  attachApiRef: RefObject<ComposerAttachApi | null>;
  onAttachError: (code: string) => void;
  onSend: (text: string, attachments: AttachmentDto[]) => void;
}) {
  const [input, setInput] = useState("");
  const tray = useAttachmentTray(channelId);
  const { add, remove, takeForSend, uploading, readyCount } = tray;

  const addFiles = useCallback(
    (files: File[]) => {
      if (!canAttach) {
        onAttachError("ATTACH_FORBIDDEN");
        return;
      }
      const error = add(files);
      if (error) {
        onAttachError(error);
      }
    },
    [add, canAttach, onAttachError],
  );

  useEffect(() => {
    attachApiRef.current = { addFiles };
    return () => {
      attachApiRef.current = null;
    };
  }, [addFiles, attachApiRef]);

  const textEmpty = canonicalMessageLength(input) === 0;
  const canSubmit = !uploading && (canSendMessageDraft(input) || (readyCount > 0 && textEmpty));

  const isTouch = useIsTouch();

  const submit = useCallback(() => {
    if (!canSubmit) {
      return;
    }
    const text = canonicalMessageContent(input);
    onSend(text, takeForSend());
    setInput("");
  }, [canSubmit, input, onSend, takeForSend]);

  return (
    <div className="shrink-0 px-4 pb-4 max-md:px-2 max-md:pb-2">
      <AttachmentTray items={tray.items} onRemove={remove} />
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <MessageComposer
          value={input}
          onValueChange={setInput}
          onSubmit={submit}
          onPasteFiles={addFiles}
          allowEmpty={readyCount > 0}
          placeholder={`Написать в #${channelName}`}
          leading={
            canAttach ? (
              <FileTrigger
                acceptedFileTypes={ACCEPTED_TYPES}
                allowsMultiple
                onSelect={(files) => {
                  const list = Array.from(files ?? []);
                  if (list.length > 0) {
                    addFiles(list);
                  }
                }}
              >
                <IconButton icon="plus" label="Прикрепить картинку" />
              </FileTrigger>
            ) : undefined
          }
        />
        <Button
          type="submit"
          leadingIcon="send"
          className="w-11 px-0"
          // Тач: фокус остаётся в поле — клавиатура не прячется после каждой отправки.
          preventFocusOnPress={isTouch}
          isDisabled={!canSubmit}
          aria-label={uploading ? "Картинки ещё загружаются" : "Отправить"}
        />
      </form>
    </div>
  );
}

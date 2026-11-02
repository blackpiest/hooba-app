import { useEffect, useRef, useState } from "react";
import type { MessageDto } from "@/shared/api/messages";
import { displayMessageContent } from "@/features/chat/message-content";
import { writeClipboardText } from "@/shared/lib/clipboard";
import { Card, ConfirmDialog, Icon, IconButton } from "@/shared/ui";
import { useDisplayName } from "@/stores/member-profile-store";

/** Подтверждение удаления чужого сообщения (модератор): превью автора и текста. */
export function DeleteMessageDialog({
  message,
  onConfirm,
  onClose,
}: {
  message: MessageDto;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const authorName = useDisplayName(message.author_id, message.author_username);
  const pictures = message.attachments?.length ?? 0;
  const text = displayMessageContent(message.content).trim();
  return (
    <ConfirmDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      tone="danger"
      title="Удалить сообщение?"
      confirmLabel="Удалить"
      description={
        <div className="flex flex-col gap-3">
          <span>Сообщение участника {authorName} будет удалено для всех. Действие попадёт в журнал модерации.</span>
          <Card variant="outline" className="p-3 text-sm">
            <p className="text-xs font-semibold text-muted">{authorName}</p>
            {text ? <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-fg">{text}</p> : null}
            {pictures > 0 ? (
              <p className="mt-1 text-xs text-muted">{pictures === 1 ? "1 картинка" : `${pictures} картинки`}</p>
            ) : null}
          </Card>
        </div>
      }
    />
  );
}

/** Копирует ссылку в буфер; на 1.5 с значок меняется на галочку. */
function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  return (
    <IconButton
      size="sm"
      icon={copied ? "check" : "copy"}
      label={copied ? "Ссылка скопирована" : "Копировать ссылку"}
      onPress={() => {
        void writeClipboardText(url).then((ok) => {
          if (!ok) {
            return;
          }
          setCopied(true);
          window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    />
  );
}

/** Подтверждение перехода по внешней ссылке из сообщения. */
export function ExternalLinkDialog({
  url,
  onConfirm,
  onClose,
}: {
  url: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      title="Внешняя ссылка"
      confirmLabel="Перейти"
      description={
        <div className="flex flex-col gap-3">
          <span>Вы уверены, что хотите перейти по внешней ссылке?</span>
          <Card variant="outline" className="flex items-center gap-2 p-3 text-sm text-muted">
            <span className="min-w-0 flex-1 break-all">{url}</span>
            <CopyUrlButton url={url} />
          </Card>
        </div>
      }
    />
  );
}

/** Подсветка зоны канала при перетаскивании файла. */
export function DropOverlay({ channelName, allowed }: { channelName: string; allowed: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center border-2 border-dashed border-brand bg-black/60 backdrop-blur-[2px]">
      <Card className="flex max-w-xs flex-col items-center gap-2 px-6 py-5 text-center">
        <Icon name="image" size="lg" className="text-brand" />
        {allowed ? (
          <>
            <p className="font-heading text-base">Загрузить в #{channelName}</p>
            <p className="text-xs text-muted">PNG, JPEG или WebP, не больше 4 за раз</p>
          </>
        ) : (
          <p className="text-sm font-medium text-danger">Вы не можете отправлять картинки в этом канале</p>
        )}
      </Card>
    </div>
  );
}

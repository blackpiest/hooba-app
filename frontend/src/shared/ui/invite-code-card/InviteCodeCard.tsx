import { useEffect, useRef, useState, type ReactNode } from "react";
import { writeClipboardText } from "@/shared/lib/clipboard";
import { cx } from "@/utils/cx";
import { Badge } from "@/shared/ui/badge";
import { IconButton } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Tooltip } from "@/shared/ui/tooltip";

export type InviteCodeStatus = "active" | "used" | "revoked";

const STATUS_LABEL: Record<Exclude<InviteCodeStatus, "active">, string> = {
  used: "Использован",
  revoked: "Отозван",
};

export type InviteCodeCardProps = {
  code: string;
  /** Готовая ссылка-приглашение; null — адрес сервера неизвестен, кнопка копирования отключена. */
  link: string | null;
  /** Не `active` — код нельзя копировать, вместо кнопок показывается статус. */
  status?: InviteCodeStatus;
  /** Подпись под кодом: кто создал, кто пришёл по коду. */
  note?: ReactNode;
  /** Метка рядом с кодом («личный»). */
  tag?: ReactNode;
  /** Только что созданный код. */
  highlighted?: boolean;
  /** Справа от карточки: например, кнопка «Удалить». */
  actions?: ReactNode;
  className?: string;
};

/** Карточка инвайт-кода: код и копирование инвайт-ссылки с галочкой «Скопировано» (гаснет через 1,5 с). */
export function InviteCodeCard({
  code,
  link,
  status = "active",
  note,
  tag,
  highlighted,
  actions,
  className,
}: InviteCodeCardProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function flash(text: string) {
    void writeClipboardText(text).then((done) => {
      if (!done) {
        return;
      }
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    });
  }

  const active = status === "active";
  return (
    <Card
      variant="outline"
      className={cx("flex items-start gap-2 p-3", highlighted && "border-brand bg-brand-soft", className)}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <p
            className={cx(
              "min-w-0 flex-1 break-all font-label text-xs leading-5",
              active ? "text-fg" : "text-muted line-through",
            )}
          >
            {code}
          </p>
          {tag}
          {active ? (
            <>
              <Tooltip content="Копировать инвайт-ссылку">
                <IconButton
                  size="sm"
                  icon={copied ? "check" : "copy"}
                  label={copied ? "Скопировано" : "Копировать инвайт-ссылку"}
                  className={copied ? "text-success" : undefined}
                  isDisabled={link === null}
                  onPress={() => link && flash(link)}
                />
              </Tooltip>
            </>
          ) : (
            <Badge variant={status === "revoked" ? "danger" : "neutral"}>{STATUS_LABEL[status]}</Badge>
          )}
        </div>
        {note ? <div className="mt-1 text-[11px] text-muted">{note}</div> : null}
      </div>
      {actions}
    </Card>
  );
}

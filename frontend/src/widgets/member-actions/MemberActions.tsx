import { useState } from "react";
import type { UserDirectoryEntry } from "@/shared/api/users";
import { CheckList, CheckListItem } from "@/shared/ui/check-list";
import {
  Alert,
  Button,
  ConfirmDialog,
  ContextMenu,
  MenuItem,
  Modal,
  RoleBadge,
  SectionLabel,
  TextField,
  Textarea,
} from "@/shared/ui";
import { REPORT_REASON_MAX } from "@/shared/api/reports";
import { displayNameOf } from "@/shared/lib/display-name";
import { useRoleStore } from "@/stores/role-store";
import { GrantCosmeticsDialog } from "@/widgets/grant-cosmetics";

type Step = "menu" | "admin" | "roles" | "cosmetics" | "name" | "kick" | "ban" | "report";

/**
 * Меню участника (ПКМ по участнику или кнопка «…»): у всех — «Пожаловаться», у владельца/админа
 * (`canModerate`) ещё и действия над участником. Каждый пункт открывает окно подтверждения.
 * Обработчики возвращают `true`, когда действие выполнено.
 */
export function MemberActions({
  member,
  point,
  initialStep = "menu",
  viewerIsOwner,
  canModerate,
  reported,
  busy,
  message,
  onClose,
  onToggleAdmin,
  onToggleRole,
  onKick,
  onBan,
  onToggleNameLock,
  onReport,
}: {
  member: UserDirectoryEntry;
  /** Где открыть меню (координаты окна). */
  point: { x: number; y: number };
  /** С какого шага начать: «report» — сразу окно жалобы (вызов из меню голосовой комнаты). */
  initialStep?: Step;
  viewerIsOwner: boolean;
  /** Показывать действия модерации (OWNER/ADMIN). Иначе в меню только «Пожаловаться». */
  canModerate: boolean;
  /** У меня уже есть открытая жалоба на этого участника. */
  reported: boolean;
  busy: boolean;
  /** Ошибка последнего действия — показывается в открытом окне. */
  message: string | null;
  onClose: () => void;
  onToggleAdmin: (makeAdmin: boolean) => Promise<boolean>;
  onToggleRole: (roleId: number, on: boolean) => Promise<boolean>;
  onKick: (reason: string) => Promise<boolean>;
  onBan: (reason: string) => Promise<boolean>;
  /** Скрыть отображаемое имя (`true`) или снять запрет (`false`). */
  onToggleNameLock: (locked: boolean, reason: string) => Promise<boolean>;
  onReport: (reason: string) => Promise<boolean>;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [reason, setReason] = useState("");
  const isAdmin = member.roles.includes("ADMIN");
  const nameLocked = member.display_name_locked ?? false;
  // Направление фиксируем при выборе пункта: `user:updated` приходит раньше ответа и перевернул бы открытый диалог.
  const [nameStep, setNameStep] = useState({ hide: !nameLocked, name: member.display_name });
  const hideName = nameStep.hide;
  const canReport = !member.roles.includes("OWNER");
  const catalog = useRoleStore((s) => s.roles);
  const customRoles = catalog.filter((role) => role.key === null);
  const owned = new Set(member.role_ids ?? []);

  async function confirm(action: () => Promise<boolean>) {
    if (await action()) {
      onClose();
    }
  }

  if (step === "menu") {
    return (
      <ContextMenu
        x={point.x}
        y={point.y}
        onClose={onClose}
        closeOnAction={false}
        aria-label={`Действия: ${member.username}`}
        onAction={(key) => {
          if (key === "name") {
            setNameStep({ hide: !nameLocked, name: member.display_name });
          }
          setStep(key as Step);
        }}
      >
        {canModerate && viewerIsOwner ? (
          <MenuItem id="admin" icon="user">
            {isAdmin ? "Снять админа" : "Сделать админом"}
          </MenuItem>
        ) : null}
        {canModerate && viewerIsOwner && customRoles.length > 0 ? (
          <MenuItem id="roles" icon="users">
            Роли…
          </MenuItem>
        ) : null}
        {viewerIsOwner ? (
          <MenuItem id="cosmetics" icon="shield">
            Значки и титулы…
          </MenuItem>
        ) : null}
        {canModerate ? (
          <MenuItem id="name" icon={nameLocked ? "eye" : "eye-off"}>
            {nameLocked ? "Разрешить имя" : "Скрыть имя"}
          </MenuItem>
        ) : null}
        {canModerate ? (
          <MenuItem id="kick" icon="logout">
            Исключить
          </MenuItem>
        ) : null}
        {canModerate ? (
          <MenuItem id="ban" icon="warning" danger>
            Заблокировать
          </MenuItem>
        ) : null}
        {canReport ? (
          <MenuItem id="report" icon="alert" isDisabled={reported}>
            {reported ? "Жалоба на рассмотрении" : "Пожаловаться"}
          </MenuItem>
        ) : null}
      </ContextMenu>
    );
  }

  const error = message ? (
    <Alert tone="warning" compact className="mt-3">
      {message}
    </Alert>
  ) : null;

  if (step === "report") {
    const trimmed = reason.trim();
    return (
      <Modal
        isOpen
        size="sm"
        title="Пожаловаться"
        subtitle={displayNameOf(member)}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onPress={onClose}>
              Отмена
            </Button>
            <Button
              isPending={busy}
              isDisabled={trimmed.length === 0}
              onPress={() => void confirm(() => onReport(trimmed))}
            >
              Отправить
            </Button>
          </>
        }
      >
        <Textarea
          label="Причина"
          placeholder="Что произошло?"
          value={reason}
          onChange={setReason}
          // Enter отправляет, как в чате; Shift+Enter — перенос строки.
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (trimmed.length > 0 && !busy) {
                void confirm(() => onReport(trimmed));
              }
            }
          }}
          maxLength={REPORT_REASON_MAX}
          showCount
          autoFocus
        />
        {error}
      </Modal>
    );
  }

  if (step === "admin") {
    return (
      <ConfirmDialog
        isOpen
        onClose={onClose}
        title={isAdmin ? "Снять админа?" : "Сделать админом?"}
        description={
          <>
            {isAdmin
              ? `${member.username} потеряет права администратора`
              : `${member.username} получит права администратора: модерация, управление каналами.`}
            {error}
          </>
        }
        confirmLabel={isAdmin ? "Снять" : "Назначить"}
        isPending={busy}
        onConfirm={() => void confirm(() => onToggleAdmin(!isAdmin))}
      />
    );
  }

  if (step === "roles") {
    return (
      <Modal isOpen title="Роли" subtitle={member.username} size="sm" onClose={onClose}>
        <SectionLabel>Выдача применяется сразу</SectionLabel>
        <CheckList className="mt-3 max-h-64">
          {customRoles.map((role) => (
            <CheckListItem
              key={role.id}
              checked={owned.has(role.id)}
              disabled={busy}
              onChange={(on) => void onToggleRole(role.id, on)}
              trailing={<RoleBadge color={role.color ?? "transparent"} />}
            >
              {role.name}
            </CheckListItem>
          ))}
        </CheckList>
        {error}
      </Modal>
    );
  }

  if (step === "cosmetics") {
    return <GrantCosmeticsDialog userId={member.id} username={member.username} onClose={onClose} />;
  }

  if (step === "name") {
    return (
      <ConfirmDialog
        isOpen
        onClose={onClose}
        tone={hideName ? "danger" : "default"}
        title={hideName ? "Скрыть имя?" : "Разрешить имя?"}
        description={
          <>
            <p className="mb-4">
              {!hideName
                ? `${member.username} снова сможет задать отображаемое имя.`
                : `${nameStep.name ? `Имя «${nameStep.name}» будет удалено, все увидят логин ${member.username}. ` : ""}Задать новое имя участник не сможет, пока вы не снимете запрет.`}
            </p>
            <TextField aria-label="Причина" value={reason} onChange={setReason} placeholder="Причина, если нужна" />
            {error}
          </>
        }
        confirmLabel={hideName ? "Скрыть" : "Разрешить"}
        isPending={busy}
        onConfirm={() => void confirm(() => onToggleNameLock(hideName, reason))}
      />
    );
  }

  const isBan = step === "ban";
  return (
    <ConfirmDialog
      isOpen
      onClose={onClose}
      tone="danger"
      title={isBan ? "Заблокировать участника?" : "Исключить участника?"}
      description={
        <>
          <p className="mb-4">
            {isBan
              ? `Аккаунт ${member.username} будет закрыт: войти он больше не сможет.`
              : `${member.username} будет убран из сообщества. Вернуться можно с новым инвайтом.`}
          </p>
          <TextField aria-label="Причина" value={reason} onChange={setReason} placeholder="Причина, если нужна" />
          {error}
        </>
      }
      confirmLabel={isBan ? "Заблокировать" : "Исключить"}
      isPending={busy}
      onConfirm={() => void confirm(() => (isBan ? onBan(reason) : onKick(reason)))}
    />
  );
}

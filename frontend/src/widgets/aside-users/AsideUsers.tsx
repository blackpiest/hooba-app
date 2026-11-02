import type { UserDirectoryEntry } from "@/shared/api/users";
import { ListGroup } from "@/shared/ui";
import { MemberRow } from "@/shared/ui/member-row";
import { toggleProfileCard } from "@/widgets/user-profile-card";

/** Группа «в сети»: роль с `hoist` или общая «Онлайн» (`key = "online"`). */
export interface OnlineGroup {
  key: string;
  label: string;
  members: UserDirectoryEntry[];
}

interface AsideUsersProps {
  onlineGroups: OnlineGroup[];
  offlineMembers: UserDirectoryEntry[];
  viewerId?: number | null;
  onOpenMember: (member: UserDirectoryEntry, point: { x: number; y: number }) => void;
}

/**
 * Меню участника открывается у всех для чужих строк; `canManageMember` решает, есть ли в нём модерация.
 * У владельца действий нет (ни жалобы, ни модерации): «…» и пустое меню не показываем.
 */
function canOpenMemberMenu(member: UserDirectoryEntry, viewerId?: number | null): boolean {
  return viewerId != null && member.id !== viewerId && !member.roles.includes("OWNER");
}

export function canManageMember(member: UserDirectoryEntry, viewerId?: number | null, viewerIsStaff?: boolean): boolean {
  if (!viewerIsStaff || viewerId == null) {
    return false;
  }
  if (member.id === viewerId) {
    return false;
  }
  return !member.roles.includes("OWNER");
}

function MemberList({
  members,
  viewerId,
  onOpen,
}: {
  members: UserDirectoryEntry[];
  viewerId?: number | null;
  onOpen: (member: UserDirectoryEntry, point: { x: number; y: number }) => void;
}) {
  return (
    <div>
      {members.map((member) => (
        <MemberRow
          key={member.id}
          data={member}
          onOpenProfile={(anchor) => toggleProfileCard(member.id, member.username, anchor, "left")}
          onOpenActions={canOpenMemberMenu(member, viewerId) ? (point) => onOpen(member, point) : undefined}
        />
      ))}
    </div>
  );
}

export function AsideUsers({
  onlineGroups,
  offlineMembers,
  viewerId,
  onOpenMember,
}: AsideUsersProps) {
  const groups = onlineGroups.filter((group) => group.members.length > 0);
  return (
    <aside className="px-1.5 pb-4">
      {groups.map((group, index) => (
        <div key={group.key} className={index > 0 ? "mt-2" : undefined}>
          <ListGroup label={`${group.label} — ${group.members.length}`} />
          <MemberList members={group.members} viewerId={viewerId} onOpen={onOpenMember} />
        </div>
      ))}

      {offlineMembers.length > 0 ? (
        <div className={groups.length > 0 ? "mt-2" : undefined}>
          <ListGroup label={`Не в сети — ${offlineMembers.length}`} />
          <MemberList members={offlineMembers} viewerId={viewerId} onOpen={onOpenMember} />
        </div>
      ) : null}
    </aside>
  );
}

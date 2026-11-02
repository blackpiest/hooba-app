import { Button, Modal } from "@/shared/ui";
import { NotesText } from "@/shared/ui/notes-text";
import { useAnnouncementStore } from "@/stores/announcement-store";

/** Объявление владельца: по одному из очереди непрочитанных; закрытие отмечает его прочитанным. */
export function AnnouncementDialog() {
  const current = useAnnouncementStore((s) => s.queue[0] ?? null);
  const left = useAnnouncementStore((s) => s.queue.length);

  if (!current) {
    return null;
  }

  const close = () => useAnnouncementStore.getState().dismiss(current.id);

  return (
    <Modal
      key={current.id}
      isOpen
      size="lg"
      icon="bell"
      title={current.title}
      subtitle={left > 1 ? `Объявление · ещё ${left - 1}` : "Объявление"}
      onClose={close}
      footer={<Button onPress={close}>{left > 1 ? "Дальше" : "Понятно"}</Button>}
    >
      <NotesText body={current.body} />
    </Modal>
  );
}

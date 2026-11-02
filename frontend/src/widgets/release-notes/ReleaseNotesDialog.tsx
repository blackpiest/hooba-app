import { useEffect, useState } from "react";
import { isDesktopApp, type DesktopReleaseNotes } from "@/shared/lib/server-target";
import { Button, Modal } from "@/shared/ui";
import { NotesText } from "@/shared/ui/notes-text";

/** «Что нового»: один раз на версию десктопа, текст и флаг показа — в `desktop/release-notes.md`. */
export function ReleaseNotesDialog() {
  const desktop = isDesktopApp();
  const [notes, setNotes] = useState<DesktopReleaseNotes | null>(null);

  useEffect(() => {
    if (!desktop) {
      return;
    }
    let cancelled = false;
    void window.hoobaDesktop
      ?.releaseNotes?.()
      .then((next) => {
        if (!cancelled && next) {
          setNotes(next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  if (!notes) {
    return null;
  }

  // Отмечаем при закрытии, а не при показе: если приложение упадёт раньше, окно покажется снова.
  const close = () => {
    setNotes(null);
    void window.hoobaDesktop?.markReleaseNotesSeen?.();
  };

  return (
    <Modal
      isOpen
      size="lg"
      icon="info"
      title={notes.title}
      subtitle={`Версия ${notes.version}`}
      onClose={close}
      footer={<Button onPress={close}>Понятно</Button>}
    >
      <NotesText body={notes.body} />
    </Modal>
  );
}

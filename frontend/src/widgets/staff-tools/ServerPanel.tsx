import { apiUrl } from "@/shared/api/http";
import { removeServerIcon, uploadServerIcon } from "@/shared/api/server-settings";
import { FieldGroup, toast } from "@/shared/ui";
import { useUserStore } from "@/stores/user-store";
import { ServerIconPicker } from "@/widgets/server-icon-picker/ServerIconPicker";

function applyIcon(url: string | null) {
  const current = useUserStore.getState().me;
  if (current) {
    useUserStore.getState().setMe({ ...current, server_icon_url: url });
  }
}

/** Оформление сервера (только OWNER): аватар. Остальные получают замену по WS `server:settings`. */
export function ServerPanel() {
  const me = useUserStore((s) => s.me);
  const name = me?.server_name?.trim() || "Сервер";
  const src = me?.server_icon_url ? apiUrl(me.server_icon_url) : null;

  return (
    <FieldGroup
      title="Аватар сервера"
      description="Виден участникам в шапке списка каналов и на вкладке браузера."
      className="border border-line px-4 py-4"
    >
      <ServerIconPicker
        name={name}
        src={src}
        onChange={async (file) => {
          const saved = await uploadServerIcon(file);
          applyIcon(saved.server_icon_url);
          toast.success("Аватар сервера обновлён");
        }}
        onRemove={async () => {
          await removeServerIcon();
          applyIcon(null);
          toast.success("Аватар сервера убран");
        }}
      />
    </FieldGroup>
  );
}

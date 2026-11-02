import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/shared/ui';
import { useChannelStore } from '../../stores/channel-store';
import { useUserStore } from '../../stores/user-store';

export function AppChannelsIndexRedirect() {
  const navigate = useNavigate();
  const channels = useChannelStore((s) => s.channels);
  const loading = useChannelStore((s) => s.loading);
  const isAdmin = useUserStore((s) => s.isAdmin);

  useEffect(() => {
    if (loading) return;
    if (channels.length > 0) {
      const firstText =
        channels.find((c) => c.channel_type === "TEXT") ?? channels[0];
      navigate(`/app/channels/${firstText.id}`, { replace: true });
    }
  }, [loading, channels, navigate]);

  if (!loading && channels.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          title="Каналов пока нет"
          description={
            isAdmin
              ? 'Создайте первый кнопкой «плюс» у раздела текстовых или голосовых каналов.'
              : 'Попросите владельца или администратора создать канал.'
          }
        />
      </div>
    );
  }

  // Пока идёт редирект на первый канал, ничего не рисуем: сплэш уже сменился оболочкой, текст «Загрузка…» только мелькал бы.
  return null;
}

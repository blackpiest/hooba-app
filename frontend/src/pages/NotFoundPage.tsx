import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Slime } from '@/shared/ui';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <EmptyState
        illustration={<Slime pose="empty" />}
        title="Такой страницы нет"
        description="Ссылка устарела или в адресе опечатка."
        action={<Button onPress={() => navigate('/', { replace: true })}>На главную</Button>}
      />
    </main>
  );
}

import { Component, type ReactNode } from 'react';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Slime } from '@/shared/ui/slime';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-dvh items-center justify-center p-6">
          <EmptyState
            illustration={<Slime pose="offline" />}
            title="Что-то пошло не так"
            description="Интерфейс столкнулся с ошибкой."
            action={
              <Button variant="secondary" onPress={() => this.setState({ failed: false })}>
                Повторить
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}

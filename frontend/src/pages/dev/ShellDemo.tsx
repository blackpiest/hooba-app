import { useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Composer,
  ComposerTextarea,
  Counter,
  Divider,
  IconButton,
  ListGroup,
  ListItem,
  Mention,
  Message,
  RoleBadge,
  Section,
  SpeakingEq,
  Stage,
  Toolbar,
  ToolbarDivider,
  Topbar,
  UserDock,
  VoiceStateIcon,
  WindowControls,
} from "@/shared/ui";

/**
 * Экран целиком из компонентов кита: каналы · чат · участники.
 * Проверка того, как примитивы и доменные блоки собираются вместе. Данные — вымышленные.
 */
export function ShellDemo() {
  const [channel, setChannel] = useState("general");
  const [bold, setBold] = useState(false);
  const [text, setText] = useState("");
  const [maximized, setMaximized] = useState(false);

  return (
    <div className="mt-5 space-y-8">
      <div className="grid h-[560px] grid-cols-[240px_minmax(0,1fr)_220px] overflow-hidden border border-line bg-bg max-lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Левая колонка */}
        <aside className="flex min-h-0 flex-col border-r border-line">
          <div className="flex h-[52px] items-center border-b border-line px-4 font-heading text-lg tracking-tight">hooba</div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            <ListGroup label="Текстовые" action={<IconButton icon="plus" label="Создать канал" size="sm" />} />
            <ListItem icon="hash" active={channel === "general"} onPress={() => setChannel("general")}>
              общий
            </ListItem>
            <ListItem
              icon="hash"
              unread
              active={channel === "memes"}
              onPress={() => setChannel("memes")}
              trailing={<Counter value={3} />}
              actions={<IconButton icon="settings" label="Настройки канала" size="sm" />}
            >
              мемы
            </ListItem>
            <ListItem icon="hash" active={channel === "games"} onPress={() => setChannel("games")}>
              игры
            </ListItem>
            <ListItem icon="lock" trailing={<RoleBadge color="#F2B84B" />}>
              staff
            </ListItem>
            <ListItem icon="hash" muted>
              архив
            </ListItem>

            <ListGroup label="Голосовые" />
            <ListItem icon="speaker" trailing={<span className="font-label text-[9px]">3/8</span>}>
              Кухня
            </ListItem>
            <div className="pl-3">
              <ListItem leading={<Avatar name="Рифт" size="sm" speaking />} trailing={<SpeakingEq />}>
                Рифт
              </ListItem>
              <ListItem leading={<Avatar name="Кип" size="sm" />} trailing={<VoiceStateIcon kind="muted" />}>
                Кип
              </ListItem>
              <ListItem leading={<Avatar name="Искра" size="sm" />} trailing={<Badge variant="live">LIVE</Badge>}>
                Искра
              </ListItem>
            </div>
            <ListItem icon="speaker">Кооп</ListItem>
          </div>
          <UserDock avatar={<Avatar name="Рифт" size="md" status="online" className="[--dot-ring:var(--color-bg)]" />} name="Рифт" subtitle="На связи" onPress={() => undefined}>
            <IconButton icon="mic" label="Микрофон" size="sm" />
            <IconButton icon="headphones" label="Звук" size="sm" />
            <IconButton icon="settings" label="Настройки" size="sm" />
          </UserDock>
        </aside>

        {/* Чат */}
        <main className="flex min-h-0 min-w-0 flex-col bg-[#13131f]">
          <Topbar
            icon="hash"
            title="общий"
            trailing={
              <WindowControls
                isMaximized={maximized}
                onMinimize={() => undefined}
                onToggleMaximize={() => setMaximized((v) => !v)}
                onClose={() => undefined}
                className="-mr-4"
              />
            }
          >
            <IconButton icon="search" label="Поиск" />
            <IconButton icon="bell" label="Уведомления" />
          </Topbar>

          <div className="min-h-0 flex-1 overflow-auto py-3">
            <Divider label="Сегодня" className="mb-2 px-4" />
            <Message
              author="Рифт"
              time="21:04"
              avatar={<Avatar name="Рифт" size="lg" />}
              roleBadge={<RoleBadge color="#F2B84B" />}
              tools={
                <>
                  <IconButton icon="send" label="Ответить" size="sm" />
                  <IconButton icon="copy" label="Копировать" size="sm" />
                  <IconButton icon="trash" label="Удалить" size="sm" variant="danger" />
                </>
              }
            >
              Я в голосовом. Залетайте, <Mention>@Кип</Mention>.
            </Message>
            <Message author="Рифт" time="21:04" continuation>
              Продолжение того же автора идёт без аватара.
            </Message>
            <Message author="Искра" time="21:06" avatar={<Avatar name="Искра" size="lg" />}>
              Сейчас включу экран. Это надо видеть.
            </Message>
            <Divider label="Новые сообщения" tone="new" className="my-2 px-4" />
            <Message author="Кип" time="21:09" avatar={<Avatar name="Кип" size="lg" />}>
              Уже бегу. Ещё одну. Последнюю.
            </Message>
            <Message author="Кип" avatar={<Avatar name="Кип" size="lg" />} status="pending">
              Сообщение в процессе отправки
            </Message>
            <Message author="Кип" avatar={<Avatar name="Кип" size="lg" />} status="failed" onRetry={() => undefined}>
              Не удалось доставить
            </Message>
            <Message author="Эхо" avatar={<Avatar name="Эхо" size="lg" />} status="deleted">
              Сообщение удалено модератором
            </Message>
          </div>

          <div className="p-4 pt-0">
            <Composer
              toolbar={
                <>
                  <Toolbar aria-label="Форматирование" className="border-0 bg-transparent p-0">
                    <IconButton icon="bold" label="Жирный" size="sm" pressed={bold} onPress={() => setBold((v) => !v)} />
                    <IconButton icon="italic" label="Курсив" size="sm" />
                    <IconButton icon="code" label="Код" size="sm" />
                    <ToolbarDivider />
                    <IconButton icon="image" label="Картинка" size="sm" />
                    <IconButton icon="smile" label="Эмодзи" size="sm" />
                  </Toolbar>
                  <Button size="sm" leadingIcon="send" className="ml-auto" isDisabled={!text.trim()}>
                    Отправить
                  </Button>
                </>
              }
            >
              <ComposerTextarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Написать в #общий" />
            </Composer>
          </div>
        </main>

        {/* Участники */}
        <aside className="flex min-h-0 flex-col border-l border-line max-lg:hidden">
          <div className="flex h-[52px] items-center border-b border-line px-4 font-label text-[10px] uppercase tracking-[0.1em] text-muted">
            Участники · 4
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            <ListGroup label="В сети — 3" />
            <ListItem size="lg" leading={<Avatar name="Рифт" size="md" status="online" />} description="Слушает музыку">
              Рифт
            </ListItem>
            <ListItem size="lg" leading={<Avatar name="Кип" size="md" status="idle" />} description="Dota 2 · 1ч 20м">
              Кип
            </ListItem>
            <ListItem size="lg" leading={<Avatar name="Искра" size="md" status="dnd" />} trailing={<Badge variant="live">LIVE</Badge>}>
              Искра
            </ListItem>
            <ListGroup label="Не в сети — 1" />
            <ListItem size="lg" muted leading={<Avatar name="Эхо" size="md" status="offline" />}>
              Эхо
            </ListItem>
          </div>
        </aside>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Section
          title="Приватность"
          actions={<Badge variant="brand">staff</Badge>}
          footer={
            <>
              <Button variant="ghost" size="sm">
                Сбросить
              </Button>
              <Button size="sm">Сохранить</Button>
            </>
          }
        >
          <p className="text-sm text-muted">Блок настроек: шапка, тело и нижняя панель действий.</p>
        </Section>

        <div className="grid grid-cols-2 gap-4">
          <Card interactive>
            <p className="font-label text-[10px] uppercase tracking-[0.1em] text-muted">P1</p>
            <p className="mt-2 font-heading text-sm">Рифт</p>
          </Card>
          <Card variant="selected">
            <p className="font-label text-[10px] uppercase tracking-[0.1em] opacity-60">P2</p>
            <p className="mt-2 font-heading text-sm">Кип · выбран</p>
          </Card>
          <Card variant="outline">
            <p className="font-heading text-sm">Outline</p>
          </Card>
          <Card variant="dashed">
            <p className="font-heading text-sm">Твоё место</p>
          </Card>
        </div>
      </div>

      <Stage
        overlay={
          <>
            <Badge variant="live">LIVE</Badge>
            <span className="font-label text-[10px] uppercase tracking-[0.06em]">Искра · 1080p · 60 fps</span>
          </>
        }
        controls={
          <>
            <IconButton icon="speaker" label="Громкость" variant="solid" />
            <IconButton icon="screen" label="Во весь экран" variant="solid" />
            <Button variant="danger-ghost" size="sm">
              Выйти
            </Button>
          </>
        }
      >
        <Avatar name="Искра" size="preview" />
      </Stage>
    </div>
  );
}

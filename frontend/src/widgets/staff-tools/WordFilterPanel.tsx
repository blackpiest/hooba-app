import { Fragment, useEffect, useState } from "react";
import { formatApiError } from "@/shared/api/format-error";
import {
  BANNED_WORDS_MAX,
  BANNED_WORD_MAX_LENGTH,
  fetchBannedWords,
  normalizeBannedPattern,
  saveBannedWords,
} from "@/shared/api/word-filter";
import { Alert, Button, EmptyState, FieldGroup, InlineCode, Tag, TextField } from "@/shared/ui";
import { PanelIntro } from "./panel-layout";

/** Как работает «*»: шаблон → что ловит. */
const PATTERN_EXAMPLES: [string, string][] = [
  ["дурак", "только это слово"],
  ["дурак*", "дурак, дурака, дураки…"],
  ["*дурак", "слова, которые заканчиваются на «дурак»"],
  ["*дурак*", "слова, которые содержат «дурак»"],
];

/** Список запрещённых слов (только OWNER). Каждое добавление/удаление сразу сохраняется на сервере. */
export function WordFilterPanel() {
  const [words, setWords] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBannedWords()
      .then((list) => {
        if (!cancelled) {
          setWords(list);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? formatApiError(e.message) : "Не удалось загрузить список");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: string[]): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      setWords(await saveBannedWords(next));
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? formatApiError(e.message) : "Не удалось сохранить список");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onAdd() {
    const pattern = normalizeBannedPattern(draft);
    if (!pattern) {
      setError(`Только буквы и цифры, до ${BANNED_WORD_MAX_LENGTH} символов; «*» — лишь в начале или в конце.`);
      return;
    }
    if (words.includes(pattern)) {
      setDraft("");
      setError(null);
      return;
    }
    if (words.length >= BANNED_WORDS_MAX) {
      setError(`Не больше ${BANNED_WORDS_MAX} слов.`);
      return;
    }
    void save([...words, pattern]).then((saved) => {
      if (saved) {
        setDraft("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelIntro>
        Запрещённые слова в новых и отредактированных сообщениях заменяются звёздочками. Логин при регистрации и
        отображаемое имя с такими словами сервер не примет.
      </PanelIntro>

      <FieldGroup title="Добавить слово">
        <form
          className="flex items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd();
          }}
        >
          <TextField
            aria-label="Запрещённое слово"
            className="flex-1"
            value={draft}
            onChange={setDraft}
            maxLength={BANNED_WORD_MAX_LENGTH + 2}
            isDisabled={loading}
            placeholder="Слово или шаблон, напр. дурак*"
          />
          <Button type="submit" isPending={busy} isDisabled={loading || !draft.trim()}>
            Добавить
          </Button>
        </form>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 border border-line px-4 py-3 text-xs text-muted">
          {PATTERN_EXAMPLES.map(([pattern, meaning]) => (
            <Fragment key={pattern}>
              <dt>
                <InlineCode>{pattern}</InlineCode>
              </dt>
              <dd>{meaning}</dd>
            </Fragment>
          ))}
        </dl>
        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}
      </FieldGroup>

      <FieldGroup title="Список" description={loading ? undefined : `${words.length} из ${BANNED_WORDS_MAX}`}>
        {loading ? null : words.length === 0 ? (
          <EmptyState compact title="Список пуст — сообщения не фильтруются." />
        ) : (
          <ul className="flex max-h-60 flex-wrap gap-1.5 overflow-y-auto">
            {words.map((word) => (
              <li key={word}>
                <Tag
                  removeLabel={`Удалить «${word}»`}
                  onRemove={busy ? undefined : () => void save(words.filter((item) => item !== word))}
                >
                  <span className="font-label">{word}</span>
                </Tag>
              </li>
            ))}
          </ul>
        )}
      </FieldGroup>
    </div>
  );
}

const BY_CODE: Record<string, string> = {
  INVALID_CREDENTIALS: 'Неверное имя или пароль.',
  ACCOUNT_DISABLED: 'Аккаунт отключён.',
  KICKED: 'Вас исключили из сообщества. Вернуться можно регистрацией с новым инвайтом.',
  RATE_LIMITED: 'Слишком много попыток. Подождите немного.',
  INVITE_INVALID: 'Код приглашения недействителен.',
  INVITE_REVOKED: 'Приглашение отозвано.',
  INVITE_USED: 'Приглашение уже использовано.',
  INVITE_EXPIRED: 'Срок приглашения истёк.',
  INVITE_DISABLED: 'Приглашение сейчас недоступно.',
  USERNAME_ALREADY_EXISTS: 'Это имя уже занято.',
  USERNAME_FORBIDDEN: 'Пожалуйста, придумайте другой логин.',
  DISPLAY_NAME_LOCKED: 'Администрация запретила менять имя.',
  DISPLAY_NAME_FORBIDDEN: 'Пожалуйста, придумайте другое имя.',
  DISPLAY_NAME_TAKEN: 'Это логин другого участника — придумайте другое имя.',
  BOOTSTRAP_REQUIRED: 'Сначала завершите первичную настройку сервера.',
  SERVER_ALREADY_BOOTSTRAPPED: 'Сервер уже настроен. Войдите под владельцем.',
  FORBIDDEN: 'Недостаточно прав.',
  COSMETIC_LOCKED: 'Этот предмет ещё не открыт: его дают за испытание.',
  CHALLENGE_PUBLISHED: 'Опубликованное испытание нельзя удалить — только архивировать.',
  BADGE_NOT_OWNED: 'Этого значка у тебя нет.',
  TITLE_NOT_OWNED: 'Этого титула у тебя нет.',
  TITLE_IN_USE: 'Титул — награда испытания. Сначала уберите его из наград или архивируйте испытание.',
  TITLES_LIMIT: 'Достигнут лимит своих титулов.',
  ROLE_FORBIDDEN: 'Это может сделать только владелец.',
  ROLE_NAME_TAKEN: 'Роль с таким названием уже есть.',
  ROLE_LIMIT: 'Достигнут лимит ролей.',
  SEND_FORBIDDEN: 'У вас нет права писать в этом канале.',
  VOICE_SCREEN_FORBIDDEN: 'У вас нет права проводить трансляцию в этом канале.',
  NOT_FOUND: 'Не найдено.',
  MESSAGE_EMPTY: 'Сообщение не может быть пустым.',
  ATTACH_FORBIDDEN: 'У вас нет права отправлять картинки в этом канале.',
  REACT_FORBIDDEN: 'У вас нет права ставить реакции в этом канале.',
  REACTION_LIMIT: 'У сообщения уже 10 разных реакций.',
  EMOJI_LIMIT: 'Достигнут лимит: 32 своих реакции.',
  EMOJI_NAME_TAKEN: 'Реакция с таким именем уже есть.',
  IMAGE_TOO_SMALL: 'Картинка слишком маленькая.',
  ATTACHMENT_INVALID: 'Картинка не найдена или уже отправлена. Прикрепите её заново.',
  UNSUPPORTED_IMAGE: 'Можно прикреплять только PNG, JPEG и WebP.',
  FILE_TOO_LARGE: 'Картинка больше 10 МБ.',
  IMAGE_TOO_BIG: 'Слишком большое разрешение картинки.',
  INVALID_IMAGE: 'Файл повреждён или это не картинка.',
  TOO_MANY_ATTACHMENTS: 'Не больше 4 картинок в одном сообщении.',
  TOO_MANY_PENDING: 'Слишком много неотправленных картинок.',
  UPLOAD_QUOTA_EXCEEDED: 'Достигнут дневной лимит загрузки картинок.',
  UPLOAD_BUSY: 'Сервер занят обработкой картинок, попробуйте ещё раз.',
  STORAGE_FULL: 'На сервере закончилось место для картинок.',
  UPLOAD_FAILED: 'Не удалось загрузить картинку.',
  MESSAGE_TOO_LONG: 'Сообщение слишком длинное.',
  MESSAGE_FORBIDDEN: 'Можно менять только свои сообщения.',
  VALIDATION_ERROR: 'Проверьте введённые данные.',
  REPORT_ALREADY_EXISTS: 'Ваша жалоба на этого участника ещё рассматривается.',
};

export function formatApiError(raw: string, fallback = 'Что-то пошло не так.'): string {
  const code = raw.split(':')[0]?.trim() ?? '';
  const known = BY_CODE[code];
  if (known) {
    return known;
  }
  const detail = raw.startsWith(`${code}:`) ? raw.slice(code.length + 1).trim() : '';
  return detail || raw || fallback;
}

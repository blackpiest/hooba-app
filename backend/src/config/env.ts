import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  /**
   * Только `development`: разрешить CORS с любого порта на этом hostname (удобно, если Vite на :5173, а в
   * `FRONTEND_ORIGIN` лень перечислять каждый порт). В production не используется.
   */
  CORS_DEV_HOSTNAME: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_SEC: z.coerce.number().min(60).max(3600).default(900),
  REFRESH_TOKEN_DAYS: z.coerce.number().min(1).max(365).default(30),
  /**
   * Сколько прокси перед процессом можно доверять при разборе клиентского IP.
   * 0 — заголовок X-Forwarded-For игнорируется (dev и прямой доступ).
   * В prod за nginx ставится 1.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * Секрет первого запуска. Пустая строка — процесс один раз генерирует токен и пишет его в лог.
   * Клиент передаёт его как setup_token в POST /api/v1/setup/bootstrap.
   */
  SETUP_TOKEN: z.string().optional(),
  /**
   * Секрет coturn `--static-auth-secret`. Если задан, голос получает короткоживущие TURN-учётные данные.
   * Долгий пароль из RTC_ICE_SERVERS_JSON клиенту не отдаётся.
   */
  TURN_AUTH_SECRET: z.string().optional(),
  /** Слушать ICE/WebRTC (mediasoup). */
  MEDIASOUP_LISTEN_IP: z.string().default('0.0.0.0'),
  /** Публичный IP/hostname для ICE-кандидатов (LAN, VPS за NAT). */
  MEDIASOUP_ANNOUNCED_IP: z.string().optional(),
  /**
   * Только если реально нужен ICE host 127.0.0.1 (одна машина, браузер → mediasoup на localhost).
   * Значение `1` — подставить 127.0.0.1, если MEDIASOUP_ANNOUNCED_IP не задан.
   */
  MEDIASOUP_ANNOUNCE_LOCALHOST: z.string().optional(),
  /**
   * Явный IP интерфейса для bind UDP/TCP mediasoup (поле listenIps.ip).
   * На Windows с MEDIASOUP_LISTEN_IP=0.0.0.0 и LAN announced часто нужно = MEDIASOUP_ANNOUNCED_IP или см. MEDIASOUP_BIND_TO_ANNOUNCED.
   */
  MEDIASOUP_BIND_IP: z.string().optional(),
  /** `1` — если MEDIASOUP_ANNOUNCED_IP — IPv4, bind на тот же адрес (обход неверного исходящего интерфейса Windows). */
  MEDIASOUP_BIND_TO_ANNOUNCED: z.string().optional(),
  /** `0` / `false` — предпочитать TCP для ICE (если UDP режется файрволом). По умолчанию UDP. */
  MEDIASOUP_PREFER_UDP: z.string().optional(),
  /**
   * Один UDP+TCP-порт для всех WebRTC-транспортов (mediasoup `WebRtcServer`). Пусто — каждый транспорт
   * берёт свой порт из MEDIASOUP_RTC_MIN_PORT..MAX_PORT (у участника голоса их два). Клиенты с loopback
   * всегда идут по старой схеме. Если порт совпадает с краем диапазона, транспорты его не займут.
   */
  MEDIASOUP_WEBRTC_PORT: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().int().min(1024).max(65535).optional(),
  ),
  MEDIASOUP_RTC_MIN_PORT: z.coerce.number().min(1024).max(65535).default(40_000),
  MEDIASOUP_RTC_MAX_PORT: z.coerce.number().min(1024).max(65535).default(49_999),
  /** JSON массив `RTCIceServer[]` для клиента (голос). Пусто — для не-loopback WS не отдаём ICE с сервера (см. mediasoup-voice). */
  RTC_ICE_SERVERS_JSON: z.string().optional(),
  /**
   * Политика ICE в браузере для mediasoup-транспортов (`getRouterCapabilities` → клиент).
   * `relay` — только TURN/relay (проверка «голос через TURN» по `COTURN_DEPLOYMENT_V1` §13); в бою обычно `all`.
   */
  RTC_ICE_TRANSPORT_POLICY: z.enum(['all', 'relay']).optional(),
  /** Каталог картинок чата (modules/attachments). Относительный путь — от cwd процесса. */
  UPLOADS_DIR: z.string().min(1).default('./data/uploads'),
  /** Квота хранилища картинок, байты. При 80% старые файлы удаляются до 70%. По умолчанию 5 ГиБ. */
  UPLOADS_MAX_BYTES: z.coerce.number().int().min(100 * 1024 * 1024).default(5 * 1024 * 1024 * 1024),
  /** Меньше этого свободного места на диске — новые загрузки отклоняются (защита Postgres на том же диске). */
  UPLOADS_MIN_FREE_BYTES: z.coerce.number().int().min(0).default(1024 * 1024 * 1024),
  /**
   * Как отдавать файлы. `stream` — backend сам (dev). `x-accel` — backend проверяет подпись и отвечает
   * `X-Accel-Redirect`, файл отдаёт nginx из `/_uploads/` (prod).
   */
  UPLOADS_SERVE_MODE: z.enum(['stream', 'x-accel']).default('stream'),
});

export type BaseEnv = z.infer<typeof envSchema>;
/** Сырые поля из схемы + список origin для CORS (см. `FRONTEND_ORIGIN` в `.env.example`). */
export type Env = BaseEnv & {
  frontendOrigins: string[];
  setupToken: string;
  setupTokenGenerated: boolean;
};

/**
 * Заглушки из `env.prod.example`, `backend/.env.example` и dev-compose лежат в публичном репо:
 * с ними любой подпишет токен владельца или пройдёт /setup. В production такой сервер не стартует.
 */
const PLACEHOLDER_MARKERS = ['замените', 'change-me', 'changeme', 'dev-only', 'dev-turn-auth-secret'];

export function assertNoPlaceholderSecrets(values: Record<string, string>): void {
  const bad = Object.entries(values)
    .filter(([, value]) => {
      const lower = value.toLowerCase();
      return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
    })
    .map(([name]) => name);
  if (bad.length > 0) {
    throw new Error(
      `${bad.join(', ')}: placeholder value from an example file. ` +
        'Replace them in .env.prod with random values (`openssl rand -hex 32`) and recreate the containers ' +
        '(`hooba repair`). install.sh keeps existing values, so re-running it will not help.',
    );
  }
}

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  const data = parsed.data;
  const frontendOrigins = data.FRONTEND_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (frontendOrigins.length === 0) {
    throw new Error('FRONTEND_ORIGIN must contain at least one origin URL');
  }
  const setupRaw = data.SETUP_TOKEN?.trim() ?? '';
  if (setupRaw.length > 0 && setupRaw.length < 16) {
    throw new Error('SETUP_TOKEN must be at least 16 characters');
  }
  const turnRaw = data.TURN_AUTH_SECRET?.trim() ?? '';
  if (turnRaw.length > 0 && turnRaw.length < 16) {
    throw new Error('TURN_AUTH_SECRET must be at least 16 characters');
  }
  if (data.NODE_ENV === 'production') {
    assertNoPlaceholderSecrets({
      JWT_SECRET: data.JWT_SECRET,
      SETUP_TOKEN: setupRaw,
      TURN_AUTH_SECRET: turnRaw,
      DATABASE_URL: data.DATABASE_URL,
    });
  }
  const setupTokenGenerated = setupRaw.length === 0;
  const setupToken = setupTokenGenerated ? randomBytes(24).toString('base64url') : setupRaw;
  return {
    ...data,
    frontendOrigins,
    SETUP_TOKEN: setupRaw || undefined,
    TURN_AUTH_SECRET: turnRaw || undefined,
    setupToken,
    setupTokenGenerated,
  };
}

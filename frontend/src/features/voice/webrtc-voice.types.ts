/** Типы UI/отладки без зависимости на mediasoup-client — импортируйте из этого файла в страницах. */

export type VoiceMediasoupOptions = {
  /** `null` / не задано — микрофон по умолчанию ОС. */
  inputDeviceId?: string | null;
  /** `null` / не задано — вывод по умолчанию (setSinkId, если браузер поддерживает). */
  outputDeviceId?: string | null;
  /** Сразу обновить своё кольцо, не дожидаясь эха `voice:user_state`. */
  onSpeaking?: (speaking: boolean) => void;
  /** Чужое кольцо: до этого клиента дошла энергия RTP. Не путать с `voice:speaking`. */
  onRemoteHearing?: (userId: number, hearing: boolean) => void;
  /** `true` — транспорт не соединился с сервером и звук не идёт; `false` — связь восстановилась. */
  onConnectionProblem?: (failed: boolean) => void;
};

export type VoiceMediaDebug = {
  sendConn: string;
  recvConn: string;
  /** Тип выбранной ICE-пары (`host` / `srflx` / `prflx` / `relay`). `null`, пока пары нет. */
  sendIce: string | null;
  recvIce: string | null;
  /** Прирост `bytesSent` исходящего RTP за последние ~2 с. `null`, пока нет второго сэмпла. */
  bytesSent2s: number | null;
  /** Локальный микрофон: muted в WebRTC = нет данных с устройства (не путать с mute в UI). */
  localMicMuted: boolean;
  localMicReady: string;
  localProducerPaused: boolean;
  localProducerId: string | null;
  remote: {
    producerId: string;
    consumerPaused: boolean;
    trackMuted: boolean;
    trackReady: string;
    bytesReceived2s: number | null;
    audioLevel: number | null;
    signalSpeaking: boolean;
  }[];
  audioPaused: boolean[];
};

export type VoiceMediasoupHandle = {
  stop: () => void;
  setMicMuted: (muted: boolean) => void;
  /**
   * На время проверки микрофона в настройках не слать звук в канал.
   * Не меняет кнопку mute: если микрофон и так был выключен, после проверки он останется выключенным.
   */
  setMicCheckHold: (held: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  /** Снимок для UI: ICE/DTLS и «muted» WebRTC = нет RTP с SFU. */
  getMediaDebug: () => VoiceMediaDebug;
  /** Текст отчёта для буфера: сигналинг, ICE, байты за 2 с, журнал. */
  getIncidentReport: () => string;
  /** Сменить микрофон без переподключения к комнате (`replaceTrack`). `null` — устройство по умолчанию. */
  replaceInputDevice: (deviceId: string | null) => Promise<void>;
  /** Устройство воспроизведения удалённого аудио (`HTMLMediaElement.setSinkId`). `null` — по умолчанию. */
  setOutputDevice: (deviceId: string | null) => Promise<void>;
  /** RTT выбранной ICE-пары до голосового сервера, мс. `null`, пока пара не выбрана. */
  measurePingMs: () => Promise<number | null>;
  /** Роутер уже знает видеокодек. Иначе демонстрацию можно начать после переподключения к голосу. */
  canPublishScreen: () => boolean;
  /** `silent` — без звука старта (возобновление показа после переподключения). */
  publishScreenShare: (
    stream: MediaStream,
    profile: ScreenSharePublishProfile,
    options?: { silent?: boolean },
  ) => Promise<void>;
  stopScreenShare: () => Promise<void>;
  /** Забрать захват без остановки дорожек, чтобы опубликовать его в новом handle той же комнаты. */
  detachScreenShare: () => MediaStream | null;
  /** Свой захват для превью ведущего: без consume и без задержки SFU. */
  getScreenShareStream: () => MediaStream | null;
  /** Звук демонстрации на лету: выключенная дорожка шлёт тишину, producer не трогаем. */
  setScreenAudioEnabled: (enabled: boolean) => void;
  watchScreenShare: () => Promise<{ video: MediaStreamTrack; audio: MediaStreamTrack | null }>;
  stopWatchingScreenShare: () => void;
  subscribeScreenProducers: (listener: (snapshot: ScreenProducerSnapshot) => void) => () => void;
};

export type ScreenSharePublishProfile = {
  maxBitrate: number;
  maxFramerate: number;
};

export type ScreenProducerSnapshot = {
  videoId: string | null;
  audioId: string | null;
  userId: number | null;
};

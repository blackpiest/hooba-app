/**
 * Выравнивание микрофона перед отправкой в канал.
 * Тихая речь поднимается примерно на 12 дБ (на слух — заметно громче).
 * Громкая сжимается, чтобы запас ползунка до 200% не уходил в хрип.
 */
const MIC_MAKEUP_DB = 12;

export const MIC_MAKEUP_GAIN = 10 ** (MIC_MAKEUP_DB / 20);

export function rampGain(node: GainNode, value: number): void {
  const param = node.gain;
  const now = node.context.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + 0.03);
}

export function createVoiceHighpass(context: BaseAudioContext): BiquadFilterNode {
  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 80;
  filter.Q.value = 0.7;
  return filter;
}

function createLeveler(context: BaseAudioContext): DynamicsCompressorNode {
  const node = context.createDynamicsCompressor();
  node.threshold.value = -24;
  node.knee.value = 12;
  node.ratio.value = 4;
  node.attack.value = 0.005;
  node.release.value = 0.2;
  return node;
}

/** Только от среза пиков выше −1 дБ, чтобы 200% не клипповало. */
export function createLimiter(context: BaseAudioContext): DynamicsCompressorNode {
  const node = context.createDynamicsCompressor();
  node.threshold.value = -1;
  node.knee.value = 0;
  node.ratio.value = 20;
  node.attack.value = 0.002;
  node.release.value = 0.05;
  return node;
}

/** Тишина на выходе, пока пустой компрессор не перестанет шуметь. */
export const OUTPUT_WARMUP_SEC = 0.2;

/**
 * Последний узел перед назначением. Ноль примерно 200 мс, затем плавное открытие:
 * свежий компрессор Chrome первые блоки отдаёт как белый шум.
 */
export function attachOutputWarmup(context: BaseAudioContext, source: AudioNode): GainNode {
  const warmup = context.createGain();
  const now = context.currentTime;
  warmup.gain.setValueAtTime(0, now);
  warmup.gain.setValueAtTime(0, now + OUTPUT_WARMUP_SEC);
  warmup.gain.linearRampToValueAtTime(1, now + OUTPUT_WARMUP_SEC + 0.06);
  source.connect(warmup);
  return warmup;
}

/**
 * Уже отфильтрованный сигнал → компрессор → ползунок → компенсация → ограничитель.
 * Срез низа и порог чувствительности ставятся раньше.
 * Индикатор речи вешайте на `userGain`: его пороги калиброваны без компенсации.
 */
export function connectMicLoudness(
  context: BaseAudioContext,
  source: AudioNode,
  userGain: GainNode,
): DynamicsCompressorNode {
  const leveler = createLeveler(context);
  const makeup = context.createGain();
  makeup.gain.value = MIC_MAKEUP_GAIN;
  const limiter = createLimiter(context);
  source.connect(leveler);
  leveler.connect(userGain);
  userGain.connect(makeup);
  makeup.connect(limiter);
  return limiter;
}

import { isPushToTalkActive } from '../../shared/lib/voice-activation-prefs';
import {
  isBrowserNoiseSuppressionEnabled,
  isEchoCancellationEnabled,
} from '../../shared/lib/voice-processing-prefs';
import { attachPttGate } from './ptt-gate';
import { attachOutputWarmup, connectMicLoudness, createVoiceHighpass } from './voice-loudness';
import { attachSensitivityGate } from './voice-sensitivity';

/**
 * Штатный шумодав браузера ждёт один канал и широкую полосу.
 * Иначе Chrome часто берёт 16 кГц, и речь вместе с шумом становится глухой.
 */
export function micProcessingConstraints(): MediaTrackConstraints {
  return {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48_000 },
    echoCancellation: isEchoCancellationEnabled(),
    noiseSuppression: isBrowserNoiseSuppressionEnabled(),
    autoGainControl: false,
  };
}

/**
 * source → срез низа → порог (речь или клавиша рации) → громкость → прогрев выхода.
 * `userGain` — ползунок микрофона. Для предпросмотра шкалы его можно оставить на 0.
 * Режим читается в момент сборки: смена активации пересобирает граф.
 */
export function connectMicChain(
  context: AudioContext,
  source: AudioNode,
  userGain: GainNode,
  onSpeechModel?: (status: 'live' | 'missing') => void,
): { output: AudioNode; stop: () => void } {
  const highpass = createVoiceHighpass(context);
  source.connect(highpass);
  const gate = isPushToTalkActive()
    ? attachPttGate(context, highpass)
    : attachSensitivityGate(context, highpass, onSpeechModel);
  const loudness = connectMicLoudness(context, gate.output, userGain);
  const output = attachOutputWarmup(context, loudness);
  return {
    output,
    stop() {
      gate.stop();
      try {
        output.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}

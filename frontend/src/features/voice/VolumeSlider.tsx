import { VOICE_VOLUME_DEFAULT, VOICE_VOLUME_MAX, VOICE_VOLUME_MIN } from '@/shared/lib/voice-volume-prefs';
import { Slider } from '@/shared/ui';

export function VolumeSlider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <Slider
      label={label}
      value={value}
      onChange={onChange}
      resetValue={VOICE_VOLUME_DEFAULT}
      minValue={VOICE_VOLUME_MIN}
      maxValue={VOICE_VOLUME_MAX}
      isDisabled={disabled}
      formatValue={(v) => `${v}%`}
    />
  );
}

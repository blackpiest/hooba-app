/**
 * Звук приложения от десктопа: PCM float32 стерео (каналы чередуются) кусками по ~10 мс → выход узла.
 * Куски приходят по IPC неровно, поэтому кольцевой буфер: старт после небольшого запаса, при недоборе —
 * тишина и новый запас, при разросшейся задержке (дрейф часов, подвисание окна) — сброс лишнего.
 */
const CHANNELS = 2;

class AppAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = Math.round(sampleRate * 0.5);
    this.ring = new Float32Array(this.capacity * CHANNELS);
    this.readIndex = 0;
    this.size = 0;
    this.prefill = Math.round(sampleRate * 0.04);
    this.maxDelay = Math.round(sampleRate * 0.2);
    this.playing = false;
    this.port.onmessage = (event) => {
      if (event.data instanceof Float32Array) {
        this.push(event.data);
      }
    };
  }

  skip(frames) {
    this.readIndex = (this.readIndex + frames) % this.capacity;
    this.size -= frames;
  }

  push(samples) {
    let frames = Math.floor(samples.length / CHANNELS);
    let offset = 0;
    if (frames > this.capacity) {
      offset = (frames - this.capacity) * CHANNELS;
      frames = this.capacity;
    }
    const overflow = this.size + frames - this.capacity;
    if (overflow > 0) {
      this.skip(overflow);
    }
    let write = (this.readIndex + this.size) % this.capacity;
    for (let i = 0; i < frames; i += 1) {
      const source = offset + i * CHANNELS;
      this.ring[write * CHANNELS] = samples[source];
      this.ring[write * CHANNELS + 1] = samples[source + 1];
      write = write + 1 === this.capacity ? 0 : write + 1;
    }
    this.size += frames;
    if (this.size > this.maxDelay) {
      this.skip(this.size - this.prefill);
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }
    const left = output[0];
    const right = output.length > 1 ? output[1] : null;
    const frames = left.length;
    if (!this.playing && this.size >= this.prefill) {
      this.playing = true;
    }
    if (!this.playing || this.size < frames) {
      this.playing = false;
      left.fill(0);
      right?.fill(0);
      return true;
    }
    let read = this.readIndex;
    for (let i = 0; i < frames; i += 1) {
      left[i] = this.ring[read * CHANNELS];
      if (right) {
        right[i] = this.ring[read * CHANNELS + 1];
      }
      read = read + 1 === this.capacity ? 0 : read + 1;
    }
    this.readIndex = read;
    this.size -= frames;
    return true;
  }
}

registerProcessor("hooba-app-audio", AppAudioProcessor);

class VadTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.frameSize = 512;
    this.step = sampleRate / this.targetRate;
    this.cursor = 0;
    this.frame = new Float32Array(this.frameSize);
    this.filled = 0;
    this.lowpass = 0;
    this.smoothed = new Float32Array(128);
    const cutoff = this.targetRate / 2;
    const dt = 1 / sampleRate;
    const rc = 1 / (2 * Math.PI * cutoff);
    this.alpha = dt / (rc + dt);
  }

  process(inputs, outputs) {
    const output = outputs && outputs[0];
    if (output) {
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        output[channelIndex].fill(0);
      }
    }
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) {
      return true;
    }
    if (this.smoothed.length < channel.length) {
      this.smoothed = new Float32Array(channel.length);
    }
    let low = this.lowpass;
    const alpha = this.alpha;
    for (let i = 0; i < channel.length; i += 1) {
      const sample = channel[i] ?? 0;
      low += alpha * (sample - low);
      this.smoothed[i] = low;
    }
    this.lowpass = low;
    let index = this.cursor;
    while (index < channel.length) {
      const sample = this.smoothed[Math.floor(index)] ?? 0;
      this.frame[this.filled] = sample;
      this.filled += 1;
      if (this.filled === this.frameSize) {
        const frame = this.frame;
        this.frame = new Float32Array(this.frameSize);
        this.filled = 0;
        this.port.postMessage(frame, [frame.buffer]);
      }
      index += this.step;
    }
    this.cursor = index - channel.length;
    return true;
  }
}

registerProcessor('hooba-vad-tap', VadTapProcessor);

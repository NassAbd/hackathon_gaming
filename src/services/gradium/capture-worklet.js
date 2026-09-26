/* global AudioWorkletProcessor, registerProcessor, sampleRate */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.processCalls = 0;
    this.inputFrames = 0;
    this.samples = [];
    this.emittedFrames = 0;
    this.chunkSize = Math.round(sampleRate * 0.08);
    this.port.onmessage = ({ data }) => {
      if (data === 'start') this.recording = true;
      if (data === 'stop') {
        this.recording = false;
        this.flush();
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }
  flush() {
    if (!this.samples.length) return;
    const samples = new Float32Array(this.samples);
    let energy = 0;
    for (const value of samples) energy += value * value;
    const length = samples.length;
    this.port.postMessage({ type: 'audio', samples, offset: this.emittedFrames, speech: Math.sqrt(energy / samples.length) > 0.01 }, [samples.buffer]);
    this.emittedFrames += length;
    this.samples = [];
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    this.processCalls++;
    this.inputFrames += samples?.length ?? 0;
    if (this.processCalls === 1 || this.processCalls % 48 === 0) {
      let energy = 0;
      if (samples) for (const value of samples) energy += value * value;
      this.port.postMessage({ type: 'diagnostic', processCalls: this.processCalls,
        inputFrames: this.inputFrames, sampleRate, channels: inputs[0]?.length ?? 0, rms: samples?.length ? Math.sqrt(energy / samples.length) : 0 });
    }
    if (this.recording) {
      if (samples) for (const sample of samples) {
        this.samples.push(sample);
        if (this.samples.length >= this.chunkSize) this.flush();
      }
    }
    // No input is copied to outputs: microphone monitoring is silent.
    return true;
  }
}
registerProcessor('soniccheck-capture', CaptureProcessor);

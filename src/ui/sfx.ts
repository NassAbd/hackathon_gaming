export type Cue = 'press' | 'lock' | 'move' | 'fail' | 'mate' | 'complete' | 'ready' | 'start' | 'capture' | 'check' | 'timeout' | 'combo' | 'next';
const tones: Record<Cue, number[]> = { press: [520], lock: [700, 880], move: [330], fail: [230, 180], mate: [523, 659, 784], complete: [523, 659, 784, 1047], ready: [392, 523], start: [330, 660], capture: [196, 392], check: [622, 466], timeout: [196, 147], combo: [659, 784, 1047], next: [392, 494] };
/** Separate, optional output only. Never connects to the microphone graph. */
export class LocalSfx {
  private silent = false;
  private voices = new Set<OscillatorNode>();
  get muted(): boolean { return this.silent; }
  set muted(value: boolean) { this.silent = value; if (value) this.stop(); }
  /** Immediately discard queued and sounding tones before microphone capture. */
  stop(): void {
    for (const oscillator of this.voices) {
      try { oscillator.stop(); oscillator.disconnect(); } catch { /* Already ended. */ }
    }
    this.voices.clear();
  }
  private context: AudioContext | null = null;
  constructor(private readonly capturing: () => boolean) {}
  unlock(): void {
    if (this.muted || typeof AudioContext === 'undefined') return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Sound is optional. */ }
  }
  play(cue: Cue): void {
    const context = this.context;
    if (this.muted || this.capturing() || !context || context.state !== 'running') return;
    this.stop();
    try {
      tones[cue].forEach((frequency, index) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const at = context.currentTime + index * 0.055;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.035, at + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.065);
        oscillator.connect(gain); gain.connect(context.destination);
        this.voices.add(oscillator);
        oscillator.start(at); oscillator.stop(at + 0.075);
        oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Autoplay/device failure never interrupts play. */ }
  }
}

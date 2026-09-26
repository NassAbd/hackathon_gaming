export type Cue = 'press' | 'lock' | 'move' | 'fail' | 'mate' | 'complete';
const tones: Record<Cue, number[]> = { press: [520], lock: [700, 880], move: [330], fail: [230, 180], mate: [523, 659, 784], complete: [523, 659, 784, 1047] };
/** Separate, optional output only. Never connects to the microphone graph. */
export class LocalSfx {
  muted = false;
  private context: AudioContext | null = null;
  constructor(private readonly capturing: () => boolean) {}
  unlock(): void {
    if (this.muted || typeof AudioContext === 'undefined') return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Sound is optional. */ }
  }
  play(cue: Cue): void {
    const context = this.context;
    if (this.muted || this.capturing() || !context || context.state !== 'running') return;
    try {
      tones[cue].forEach((frequency, index) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const at = context.currentTime + index * 0.055;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.035, at + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.065);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(at); oscillator.stop(at + 0.075);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Autoplay/device failure never interrupts play. */ }
  }
}
